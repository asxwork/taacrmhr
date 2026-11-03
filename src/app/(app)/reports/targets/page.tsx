import { format, parse } from "date-fns";
import { requirePermission, scopeMatcher } from "@/lib/permissions";
import { usersInScope } from "@/lib/crm";
import { overallPct, targetProgress } from "@/lib/targets";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { TargetBars } from "@/components/crm/target-bars";
import { saveTarget } from "./actions";

export const metadata = { title: "Targets" };

/** Reports → Targets: monthly goals per person and how far along they are, ranked (a leaderboard). */
export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("crm.targets");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : format(new Date(), "yyyy-MM");
  const people = await usersInScope(user, "crm.targets", "view");
  const [progress, canEdit] = await Promise.all([targetProgress(people.map((p) => p.id), month), scopeMatcher(user, "crm.targets", "edit")]);
  const rows = people.map((p) => ({ ...p, prog: progress.get(p.id)!, pct: overallPct(progress.get(p.id)!) })).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  return (
    <>
      <PageHeader title="Targets" description={`${format(parse(month, "yyyy-MM", new Date()), "MMMM yyyy")} · calls and site visits logged, deals won. Ranked by how much of their targets each person has reached.`}
        actions={<AutoFilterForm><input type="month" name="month" defaultValue={month} className="input h-9" aria-label="Month" /></AutoFilterForm>} />
      {rows.length === 0 ? <Card><EmptyState title="Nobody in your scope" /></Card> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <Card key={r.id} className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">{i + 1}</span>
                <p className="flex-1 truncate font-medium">{r.name}</p>
                <span className="text-sm font-semibold tabular-nums">{r.pct == null ? "No targets" : `${r.pct}%`}</span>
              </div>
              <TargetBars p={r.prog} />
              {canEdit({ ownerId: r.id, branchId: r.branchId }) && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-medium text-navy-900">Set targets</summary>
                  <ActionForm action={saveTarget} className="mt-2 grid grid-cols-2 gap-2">
                    <input type="hidden" name="userId" value={r.id} /><input type="hidden" name="month" value={month} />
                    {([["calls", "Calls"], ["visits", "Site visits"], ["deals", "Deals"], ["wonValue", "Won value (PKR)"]] as const).map(([k, l]) => (
                      <label key={k} className="text-xs text-muted">{l}<input name={k} inputMode="numeric" defaultValue={r.prog.target[k] || ""} className="input mt-1 h-9" /></label>
                    ))}
                    <div className="col-span-2"><SubmitButton className="h-9 w-full">Save</SubmitButton></div>
                  </ActionForm>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
