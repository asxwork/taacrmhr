import Link from "@/components/link";
import { Merge } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { fieldAccess } from "@/lib/field-rules";
import { fmtPhone } from "@/lib/crm-shared";
import { maskEmail, maskPhone } from "@/lib/field-defs";
import { fmtDate } from "@/lib/utils";
import { DUPLICATE_MODES, bestOf, duplicateMode, duplicateSets } from "@/lib/lead-merge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { StatusPill } from "@/components/crm/bits";
import { cn } from "@/lib/utils";
import { mergeAllLeads, mergeLeads } from "./actions";

export const metadata = { title: "Duplicate leads" };
const PAGE = 40;

/** Leads → Duplicates: leads sharing a phone number (or email), merged one group at a time or all at once. */
export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<{ by?: string; more?: string; merged?: string; groups?: string; skipped?: string; left?: string }> }) {
  const user = await requirePermission("crm.merge");
  const sp = await searchParams;
  const by = duplicateMode(sp.by ?? "exact");
  const scope = (await scopeWhere(user, "crm.merge"))!;
  const [sets, fields] = await Promise.all([Promise.all(DUPLICATE_MODES.map((m) => duplicateSets(scope, m.value))), fieldAccess(user)]);
  const counts = Object.fromEntries(DUPLICATE_MODES.map((m, i) => [m.value, sets[i]!]));
  const groups = counts[by]!;
  const limit = Math.min(groups.length, PAGE * Math.max(1, Number(sp.more) || 1));
  const shownGroups = groups.slice(0, limit);
  const keys = shownGroups.map((g) => g.key);
  const leads = keys.length ? await db.lead.findMany({
    where: { ...scope, id: { in: shownGroups.flatMap((g) => g.ids) } },
    include: { status: true, owner: { select: { name: true, active: true } }, source: { select: { name: true } }, _count: { select: { activities: true, deals: true } } },
    orderBy: { createdAt: "asc" },
  }) : [];
  const canMerge = can(user, "crm.merge", "edit");
  const pm = fields["lead.phone"], em = fields["lead.email"];
  const extra = (gs: { ids: string[] }[]) => gs.reduce((s, g) => s + g.ids.length - 1, 0);
  // Group heading: the shared phone (or email), plus the person for the per-person groupings.
  const show = (k: string, rows: { owner: { name: string } | null }[]) => {
    if (by === "email") return em === "full" ? k : em === "mask" ? maskEmail(k) : "Same email";
    const ph = k.split("|")[0]!;
    const phone = pm === "full" ? fmtPhone(ph) : pm === "mask" ? maskPhone(ph) : "Same phone number";
    return by === "phone" ? phone : `${phone} · ${rows[0]?.owner?.name ?? "Unassigned"}`;
  };
  const tab = (v: string) => `/crm/duplicates?by=${v}`;

  return (
    <>
      <PageHeader title="Duplicate leads" description="Leads with the same phone number or email. Merging keeps one lead: history, deals and matches from the others move onto it, its empty fields are filled in, and the duplicates are removed." />
      {sp.merged !== undefined && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Merged <b>{sp.merged}</b> duplicate lead(s) in <b>{sp.groups}</b> group(s).
          {Number(sp.skipped) > 0 && <> {sp.skipped} group(s) were skipped: they include an old employee&apos;s lead (Super Admin only) or leads outside your access.</>}
          {Number(sp.left) > 0 && <> {sp.left} group(s) are left — press Merge all again.</>}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-lg bg-black/5 p-0.5">
          {DUPLICATE_MODES.map((m) => (
            <Link key={m.value} href={tab(m.value)} title={m.hint} className={cn("rounded-md px-3 py-1.5 text-sm", by === m.value ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
              {m.label} <span className="tabular-nums text-muted">· {counts[m.value]!.length}</span>
            </Link>
          ))}
        </div>
        {groups.length > 0 && <p className="text-sm text-muted"><b className="tabular-nums text-ink">{groups.length}</b> group{groups.length === 1 ? "" : "s"}, <b className="tabular-nums text-ink">{extra(groups)}</b> extra lead{extra(groups) === 1 ? "" : "s"}</p>}
        {canMerge && groups.length > 0 && (
          <Link href={`/crm/duplicates/review?by=${by}`} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-canvas">Review one by one</Link>
        )}
        {canMerge && groups.length > 0 && (
          <ActionForm action={mergeAllLeads}>
            <input type="hidden" name="by" value={by} />
            <SubmitButton pendingText="Merging…"><Merge className="size-4" /> Merge all {groups.length} group{groups.length === 1 ? "" : "s"}</SubmitButton>
          </ActionForm>
        )}
      </div>
      <p className="mb-4 text-xs text-muted">{DUPLICATE_MODES.find((m) => m.value === by)!.hint}. {canMerge && groups.length > 0 && "Merge all keeps, in each group, the lead with deals, else the most activities, else the oldest. To choose yourself, use Merge on a group below."}</p>

      {keys.length === 0 ? <Card><EmptyState title="No duplicates found" description={`Nothing matches “${DUPLICATE_MODES.find((m) => m.value === by)!.label}”. Try the other tabs.`} /></Card> : (
        <div className="space-y-4">
          {keys.map((k) => {
            const ids = new Set(shownGroups.find((g) => g.key === k)!.ids);
            const rows = leads.filter((l) => ids.has(l.id));
            if (rows.length < 2) return null;
            const best = bestOf(rows);
            return (
              <Card key={k} className="overflow-hidden">
                <ActionForm action={mergeLeads}>
                  <p className="border-b border-line bg-canvas/60 px-4 py-2 text-sm font-medium">{show(k, rows)} · {rows.length} leads</p>
                  <ul className="divide-y divide-line">
                    {rows.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                        <input type="hidden" name="ids" value={l.id} />
                        {canMerge && <input type="radio" name="keep" value={l.id} defaultChecked={l.id === best.id} aria-label={`Keep ${l.name}`} className="size-4 accent-navy-900" />}
                        <div className="min-w-0 flex-1">
                          <Link href={`/crm/leads/${l.id}`} className="font-medium text-navy-900 hover:underline">{l.name}</Link> <span className="text-xs text-muted">#{l.number ?? "—"}{l.bitrixId ? " · Bitrix" : ""}</span>
                          <p className="truncate text-xs text-muted">{l.source?.name ?? "No source"} · {l.owner ? `${l.owner.name}${l.owner.active ? "" : " (old employee)"}` : "Unassigned"} · created {fmtDate(l.createdAt)} · {l._count.activities} activities{l._count.deals ? ` · ${l._count.deals} deal(s)` : ""}</p>
                        </div>
                        <StatusPill name={l.status.name} colorName={l.status.color} />
                      </li>
                    ))}
                  </ul>
                  {canMerge && <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-2"><span className="text-xs text-muted">Keeps the selected lead</span><SubmitButton variant="secondary" pendingText="Merging…">Merge</SubmitButton></div>}
                </ActionForm>
              </Card>
            );
          })}
          {limit < groups.length && <Link href={`/crm/duplicates?${new URLSearchParams({ by, more: String((Number(sp.more) || 1) + 1) })}`} scroll={false} className="block rounded-xl border border-dashed border-line py-3 text-center text-sm font-medium text-navy-900 hover:bg-canvas">Show {Math.min(PAGE, groups.length - limit)} more groups</Link>}
        </div>
      )}
    </>
  );
}
