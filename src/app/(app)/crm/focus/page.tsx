import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { MessageCircle, Phone } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { followUpLists } from "@/lib/agent-reports";
import { fieldAccess } from "@/lib/field-rules";
import { maskPhone } from "@/lib/field-defs";
import { fmtPhone, telHref, waHref } from "@/lib/crm-shared";
import { leadScore, scoreLabel } from "@/lib/lead-score";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { StatusPill } from "@/components/crm/bits";

export const metadata = { title: "Focus" };

/**
 * Leads → Focus: the agent's own leads in the order to work them — overdue follow-ups, due today, never contacted,
 * hot leads with no next step, then leads untouched for a week.
 */
export default async function FocusPage() {
  const user = await requirePermission("crm.leads");
  const mine: Prisma.LeadWhereInput = { ownerId: user.id };
  const [lists, fields, statuses] = await Promise.all([
    followUpLists(mine), fieldAccess(user),
    db.leadStatus.findMany({ where: { active: true, kind: "open" }, select: { id: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const openIds = statuses.map((s) => s.id);
  type L = (typeof lists.neverContacted)[number];
  const score = (l: L) => leadScore({ kind: l.status.kind, stageIndex: Math.max(0, openIds.indexOf(l.statusId)), stageCount: openIds.length, createdAt: l.createdAt, lastActivityAt: l.lastActivityAt, hasBudget: !!(l.budgetMin || l.budgetMax), hasProperty: !!(l.projectId || l.unitId), nextDue: null });
  const queue: { lead: L; why: string; tone: string }[] = [];
  const seen = new Set<string>();
  const add = (lead: L | null | undefined, why: string, tone: string) => { if (lead && !seen.has(lead.id)) { seen.add(lead.id); queue.push({ lead, why, tone }); } };
  for (const a of lists.overdue) add(a.lead as L, `Overdue: ${a.subject} (${formatDistanceToNowStrict(a.dueAt!, { addSuffix: true })})`, "text-red-600");
  for (const a of lists.dueToday) add(a.lead as L, `Today: ${a.subject}`, "text-amber-700");
  for (const l of lists.neverContacted) add(l, `New — not contacted yet (${formatDistanceToNowStrict(l.createdAt, { addSuffix: true })})`, "text-sky-700");
  for (const l of [...lists.noNextStep].sort((a, b) => score(b) - score(a)).filter((l) => score(l) >= 35)) add(l, `${scoreLabel(score(l))} lead with no next step`, "text-violet-700");
  for (const l of lists.stale) add(l, "No contact for 7+ days", "text-muted");
  const pm = fields["lead.phone"];
  const items = queue.slice(0, 30);

  return (
    <>
      <PageHeader title="Focus" description={`Your leads in the order to work them${queue.length > 30 ? ` (first 30 of ${queue.length})` : ""}. Call, log what happened, plan the next step — then the next one.`} />
      <Card className="overflow-hidden">
        {items.length === 0 ? <EmptyState title="All caught up" description="No overdue, due or untouched leads right now." /> : (
          <ol className="divide-y divide-line">
            {items.map(({ lead, why, tone }, i) => {
              const tel = !lead.phone || pm === "hidden" ? null : pm === "mask" ? `/api/leads/${lead.id}/dial?via=tel` : telHref(lead.phone);
              const wa = !lead.phone || pm === "hidden" ? null : pm === "mask" ? `/api/leads/${lead.id}/dial?via=wa` : waHref(lead.phone);
              return (
                <li key={lead.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-6 text-center text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/crm/leads/${lead.id}`} className="font-medium text-navy-900 hover:underline">{lead.name}</Link>
                    <p className={`truncate text-xs ${tone}`}>{why}{lead.source ? ` · ${lead.source.name}` : ""}</p>
                  </div>
                  <StatusPill name={lead.status.name} colorName={lead.status.color} />
                  {lead.phone && pm !== "hidden" && <span className="hidden font-mono text-xs text-muted sm:inline">{pm === "mask" ? maskPhone(lead.phone) : fmtPhone(lead.phone)}</span>}
                  {tel && <a href={tel} aria-label={`Call ${lead.name}`} className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"><Phone className="size-4" /></a>}
                  {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${lead.name}`} className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10"><MessageCircle className="size-4" /></a>}
                  <Link href={`/crm/leads/${lead.id}#composer`} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-canvas">Log &amp; plan</Link>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
