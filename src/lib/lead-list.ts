// Rows for the lead list/board. Used for the first render (crm/leads/page.tsx) and for every in-place
// refresh (crm/leads/list-actions.ts → fetchLeadList), so filters and paging never reload the page.
import { addDays, format, startOfDay } from "date-fns";
import { db } from "./db";
import { scopeMatcher, scopeWhere } from "./permissions";
import { LEAD_FILTER_KEYS, leadWhere, type LeadFilters } from "./lead-filters";
import type { SessionUser } from "./auth";

export const LEAD_PAGE_SIZE = 50;

export type LeadRow = {
  id: string;
  number: number | null;
  name: string;
  phone: string | null;
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
};

export type NextActivity = { subject: string; due: string; late: boolean; owner: string | null };

export function nextActivity(a: { subject: string; dueAt: Date | null; owner: { name: string } | null }): NextActivity {
  return { subject: a.subject, due: format(a.dueAt!, "d MMM yyyy, h:mm a"), late: a.dueAt! < new Date(), owner: a.owner?.name ?? null };
}

export type LeadListData = {
  rows: LeadRow[];
  total: number;
  page: number;
  counters: { overdue: number; today: number; none: number };
};

export function filtersFrom(sp: Record<string, string | undefined>): LeadFilters {
  return Object.fromEntries(LEAD_FILTER_KEYS.filter((k) => sp[k]).map((k) => [k, sp[k]])) as LeadFilters;
}

export async function loadLeadList(user: SessionUser, filters: LeadFilters, view: "list" | "board", page: number): Promise<LeadListData> {
  const statuses = await db.leadStatus.findMany({ where: { active: true }, select: { id: true, kind: true } });
  const [where, scope, canEditRow] = await Promise.all([leadWhere(user, filters, statuses), scopeWhere(user, "crm.leads"), scopeMatcher(user, "crm.leads", "edit")]);
  const openWhere = { ...scope, statusId: { in: statuses.filter((s) => s.kind === "open").map((s) => s.id) } };
  const today = startOfDay(new Date());
  const [leads, total, overdue, dueToday, none] = await Promise.all([
    db.lead.findMany({
      where,
      include: { source: { select: { name: true } }, project: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: view === "list" ? (page - 1) * LEAD_PAGE_SIZE : 0,
      take: view === "list" ? LEAD_PAGE_SIZE : 500,
    }),
    db.lead.count({ where }),
    db.lead.count({ where: { ...openWhere, activities: { some: { doneAt: null, dueAt: { lt: new Date() } } } } }),
    db.lead.count({ where: { ...openWhere, activities: { some: { doneAt: null, dueAt: { gte: today, lt: addDays(today, 1) } } } } }),
    db.lead.count({ where: { ...openWhere, activities: { none: { doneAt: null, dueAt: { not: null } } } } }),
  ]);

  // Next planned activity per lead (the Bitrix "Activity" column).
  const next = new Map<string, LeadRow["next"]>();
  for (const a of await db.activity.findMany({
    where: { leadId: { in: leads.map((l) => l.id) }, doneAt: null, dueAt: { not: null } },
    select: { leadId: true, subject: true, dueAt: true, owner: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
  })) if (a.leadId && !next.has(a.leadId)) next.set(a.leadId, nextActivity(a));

  return {
    total,
    page,
    counters: { overdue, today: dueToday, none },
    rows: leads.map((l) => ({
      id: l.id,
      number: l.number,
      name: l.name,
      phone: l.phone,
      source: l.source?.name ?? null,
      project: l.project?.name ?? null,
      subtitle: [l.project?.name ?? l.propertyType, l.location].filter(Boolean).join(" · ") || null,
      budget: l.budgetMax ?? l.budgetMin ?? null,
      statusId: l.statusId,
      ownerId: l.ownerId,
      owner: l.owner?.name ?? null,
      created: format(l.createdAt, "d MMM yyyy"),
      reshuffleCount: l.reshuffledAt ? l.reshuffleCount : null,
      editable: canEditRow(l),
      next: next.get(l.id) ?? null,
    })),
  };
}
