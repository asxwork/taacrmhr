import Link from "@/components/link";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { fieldAccess } from "@/lib/field-rules";
import { fmtPhone } from "@/lib/crm-shared";
import { maskPhone } from "@/lib/field-defs";
import { fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { StatusPill } from "@/components/crm/bits";
import { mergeLeads } from "./actions";

export const metadata = { title: "Duplicate leads" };

/** Leads → Duplicates: leads sharing a phone number, with a one-click merge into the one to keep. */
export default async function DuplicatesPage() {
  const user = await requirePermission("crm.merge");
  const scope = (await scopeWhere(user, "crm.merge"))!;
  const groups = await db.lead.groupBy({ by: ["phoneKey"], where: { ...scope, phoneKey: { not: null } }, _count: { _all: true }, having: { phoneKey: { _count: { gt: 1 } } }, orderBy: { _count: { phoneKey: "desc" } }, take: 40 });
  const keys = groups.map((g) => g.phoneKey!);
  const [leads, fields] = await Promise.all([
    db.lead.findMany({ where: { ...scope, phoneKey: { in: keys } }, include: { status: true, owner: { select: { name: true } }, source: { select: { name: true } }, _count: { select: { activities: true, deals: true } } }, orderBy: { createdAt: "asc" } }),
    fieldAccess(user),
  ]);
  const canMerge = can(user, "crm.merge", "edit");
  const pm = fields["lead.phone"];

  return (
    <>
      <PageHeader title="Duplicate leads" description="Leads with the same phone number. Pick the one to keep — history, deals and matches from the others move onto it, empty fields are filled in, and the duplicates are removed." />
      {keys.length === 0 ? <Card><EmptyState title="No duplicates found" description="Every lead you can see has its own phone number." /></Card> : (
        <div className="space-y-4">
          {keys.map((k) => {
            const rows = leads.filter((l) => l.phoneKey === k);
            if (rows.length < 2) return null;
            const best = [...rows].sort((a, b) => b._count.activities + b._count.deals * 5 - (a._count.activities + a._count.deals * 5))[0]!;
            return (
              <Card key={k} className="overflow-hidden">
                <ActionForm action={mergeLeads}>
                  <p className="border-b border-line bg-canvas/60 px-4 py-2 text-sm font-medium">{pm === "full" ? fmtPhone(k) : pm === "mask" ? maskPhone(k) : "Same phone number"} · {rows.length} leads</p>
                  <ul className="divide-y divide-line">
                    {rows.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                        <input type="hidden" name="ids" value={l.id} />
                        {canMerge && <input type="radio" name="keep" value={l.id} defaultChecked={l.id === best.id} aria-label={`Keep ${l.name}`} className="size-4 accent-navy-900" />}
                        <div className="min-w-0 flex-1">
                          <Link href={`/crm/leads/${l.id}`} className="font-medium text-navy-900 hover:underline">{l.name}</Link> <span className="text-xs text-muted">#{l.number ?? "—"}</span>
                          <p className="truncate text-xs text-muted">{l.source?.name ?? "No source"} · {l.owner?.name ?? "Unassigned"} · created {fmtDate(l.createdAt)} · {l._count.activities} activities{l._count.deals ? ` · ${l._count.deals} deal(s)` : ""}</p>
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
        </div>
      )}
    </>
  );
}
