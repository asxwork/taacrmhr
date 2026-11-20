import { leadChangeMatcher } from "./lead-lock";
import { memo } from "./memo";
// Rows for the lead list/board. Used for the first render (crm/leads/page.tsx) and for every in-place
// refresh (crm/leads/list-actions.ts → fetchLeadList), so filters and paging never reload the page.
import type { Prisma } from "@prisma/client";
import { addDays, format, startOfDay } from "date-fns";
import { parseLeadSort } from "./lead-columns";
import { db } from "./db";
import { scopeWhere } from "./permissions";
import { LEAD_FILTER_KEYS, leadWhere, type LeadFilters } from "./lead-filters";
import type { SessionUser } from "./auth";
import { fieldAccess } from "./field-rules";
import { leadScoreParts } from "./lead-score";
import { maskEmail, maskPhone, shown } from "./field-defs";
import { telHref, waHref } from "./crm-shared";

export const LEAD_PAGE_SIZE = 50;
/** "Records" choices at the bottom of the list. */
export const LEAD_PAGE_SIZES = [10, 20, 50, 100, 200, 500] as const;
export const leadPageSize = (v: unknown) => (LEAD_PAGE_SIZES as readonly number[]).includes(Number(v)) ? Number(v) : LEAD_PAGE_SIZE;

export type LeadRow = {
  id: string;
  number: number | null;
  name: string;
  phone: string | null;
  /** Call / WhatsApp links: direct, or through /api/leads/<id>/dial when the number is masked for this user. */
  phoneTel: string | null;
  phoneWa: string | null;
  source: string | null;
  project: string | null;
  subtitle: string | null;
  budget: number | null;
  statusId: string;
  ownerId: string | null;
  owner: string | null;
  /** Dates are formatted here, in the company time zone (APP_TIMEZONE), like every other page. */
  created: string;
  reshuffleCount: number | null;
  editable: boolean;
  next: NextActivity | null;
  /** Lead score 0–100 (lib/lead-score.ts) and why. */
  score: number;
  scoreWhy: string[];
  /** Extra columns the user can switch on (column settings). */
  email: string | null;
  sourceInfo: string | null;
  campaign: string | null;
  location: string | null;
  interest: string | null;
  propertyType: string | null;
  createdBy: string | null;
  lastActivity: string | null;
  modified: string;
};

export type NextActivity = { subject: string; due: string; late: boolean; owner: string | null };

export function nextActivity(a: { subject: string; dueAt: Date | null; owner: { name: string } | null }): NextActivity {
  return { subject: a.subject, due: format(a.dueAt!, "d MMM yyyy, h:mm a"), late: a.dueAt! < new Date(), owner: a.owner?.name ?? null };
}

export type LeadListData = {
  rows: LeadRow[];
  total: number;
  page: number;
  /** Rows per page (Records). */
  size: number;
  counters: { overdue: number; today: number; none: number };
};

export function filtersFrom(sp: Record<string, string | undefined>): LeadFilters {
  return Object.fromEntries(LEAD_FILTER_KEYS.filter((k) => sp[k]).map((k) => [k, sp[k]])) as LeadFilters;
}

/** Database order for the sort param (see parseLeadSort); ties fall back to newest first. */
function leadOrderBy(sort?: string): Prisma.LeadOrderByWithRelationInput[] {
  const { key, desc } = parseLeadSort(sort);
  const d = desc ? "desc" : "asc";
  const n = { sort: d, nulls: "last" } as const;
  const by: Record<string, Prisma.LeadOrderByWithRelationInput> = {
    id: { number: n }, lead: { name: d }, stage: { status: { sortOrder: d } }, phone: { phone: n }, created: { createdAt: d },
    owner: { owner: { name: d } }, reshuffle: { reshuffledAt: n }, source: { source: { name: d } }, sourceInfo: { sourceInfo: n },
    project: { project: { name: d } }, email: { email: n }, campaign: { campaign: n }, location: { location: n }, interest: { interest: n },
    propertyType: { propertyType: n }, budget: { budgetMax: n }, createdBy: { createdBy: { name: d } }, lastActivity: { lastActivityAt: n }, modified: { updatedAt: d },
  };
  return key === "created" ? [by.created!, { id: d }] : [by[key]!, { createdAt: "desc" }];
}

export async function loadLeadList(user: SessionUser, filters: LeadFilters, view: "list" | "board", page: number, pageSize: number = LEAD_PAGE_SIZE): Promise<LeadListData> {
  const size = leadPageSize(pageSize);
  // Stages are cached (cleared when a stage is edited); the user's scope and field rules load alongside.
  const [statuses, scope, canEditRow, fields] = await Promise.all([
    memo("leadStatus:list", 5 * 60_000, () => db.leadStatus.findMany({ where: { active: true }, select: { id: true, kind: true, sortOrder: true }, orderBy: { sortOrder: "asc" } })),
    scopeWhere(user, "crm.leads"), leadChangeMatcher(user, "edit"), fieldAccess(user),
  ]);
  const openIds = statuses.filter((s) => s.kind === "open").map((s) => s.id);
  const where = await leadWhere(user, filters, statuses);
  const phoneMode = fields["lead.phone"];
  const openWhere = { ...scope, statusId: { in: statuses.filter((s) => s.kind === "open").map((s) => s.id) } };
  const today = startOfDay(new Date());
  const [leads, total, overdue, dueToday, none] = await Promise.all([
    db.lead.findMany({
      where,
      include: { source: { select: { name: true } }, project: { select: { name: true } }, owner: { select: { name: true, active: true } }, createdBy: { select: { name: true } } },
      orderBy: leadOrderBy(filters.sort),
      skip: view === "list" ? (page - 1) * size : 0,
      take: view === "list" ? size : 500,
    }),
    db.lead.count({ where }),
    db.lead.count({ where: { ...openWhere, activities: { some: { doneAt: null, dueAt: { lt: new Date() } } } } }),
    db.lead.count({ where: { ...openWhere, activities: { some: { doneAt: null, dueAt: { gte: today, lt: addDays(today, 1) } } } } }),
    db.lead.count({ where: { ...openWhere, activities: { none: { doneAt: null, dueAt: { not: null } } } } }),
  ]);

  // Next planned activity per lead (the Bitrix "Activity" column).
  const next = new Map<string, LeadRow["next"]>();
  const nextDue = new Map<string, Date>();
  // Score inputs too (how each source converts, how engaged each lead on this page is): all in one round.
  const ids = leads.map((l) => l.id);
  const [planned, rates, doneCounts, visits] = await Promise.all([
    db.activity.findMany({
      where: { leadId: { in: ids }, doneAt: null, dueAt: { not: null } },
      select: { leadId: true, subject: true, dueAt: true, owner: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
    }),
    import("./lead-score-data").then((m) => m.sourceRates()),
    db.activity.groupBy({ by: ["leadId"], where: { leadId: { in: ids }, doneAt: { not: null } }, _count: true }),
    db.activity.findMany({ where: { leadId: { in: ids }, type: "visit", OR: [{ doneAt: { not: null } }, { checkInAt: { not: null } }] }, select: { leadId: true }, distinct: ["leadId"] }),
  ]);
  for (const a of planned) if (a.leadId && !next.has(a.leadId)) { next.set(a.leadId, nextActivity(a)); nextDue.set(a.leadId, a.dueAt!); }
  const visited = new Set(visits.map((v) => v.leadId));

  return {
    total,
    page,
    size,
    counters: { overdue, today: dueToday, none },
    rows: leads.map((l) => ({
      id: l.id,
      number: l.number,
      name: l.name,
      phone: shown(l.phone, phoneMode, maskPhone),
      phoneTel: !l.phone || phoneMode === "hidden" ? null : phoneMode === "mask" ? `/api/leads/${l.id}/dial?via=tel` : telHref(l.phone),
      phoneWa: !l.phone || phoneMode === "hidden" ? null : phoneMode === "mask" ? `/api/leads/${l.id}/dial?via=wa` : waHref(l.phone),
      source: l.source?.name ?? null,
      project: l.project?.name ?? l.projectName ?? null,
      subtitle: [l.project?.name ?? l.propertyType, l.location].filter(Boolean).join(" · ") || null,
      budget: fields["lead.budget"] === "hidden" ? null : l.budgetMax ?? l.budgetMin ?? null,
      statusId: l.statusId,
      ownerId: l.ownerId,
      owner: l.owner?.name ?? null,
      created: format(l.createdAt, "d MMM yyyy"),
      reshuffleCount: l.reshuffledAt ? l.reshuffleCount : null,
      editable: canEditRow({ ...l, ownerActive: l.owner?.active ?? null }),
      next: next.get(l.id) ?? null,
      email: shown(l.email, fields["lead.email"], maskEmail),
      sourceInfo: l.sourceInfo ? l.sourceInfo.slice(0, 160) : null,
      campaign: l.campaign, location: l.location, interest: l.interest, propertyType: l.propertyType,
      createdBy: l.createdBy?.name ?? null,
      lastActivity: l.lastActivityAt ? format(l.lastActivityAt, "d MMM yyyy, h:mm a") : null,
      modified: format(l.updatedAt, "d MMM yyyy"),
      ...(() => { const r = leadScoreParts({
        kind: statuses.find((s) => s.id === l.statusId)?.kind ?? "open", stageIndex: Math.max(0, openIds.indexOf(l.statusId)), stageCount: openIds.length,
        createdAt: l.createdAt, lastActivityAt: l.lastActivityAt, hasBudget: !!(l.budgetMin || l.budgetMax), hasProperty: !!(l.projectId || l.unitId),
        nextDue: nextDue.get(l.id) ?? null, sourceRate: l.sourceId ? rates.get(l.sourceId) ?? null : null,
        doneActivities: doneCounts.find((d) => d.leadId === l.id)?._count ?? 0, visited: visited.has(l.id), fullContact: !!(l.phone && l.email),
      }); return { score: r.score, scoreWhy: r.why }; })(),
    })),
  };
}
