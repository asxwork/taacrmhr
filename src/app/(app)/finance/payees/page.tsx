import Link from "@/components/link";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { payeeKey, pkr } from "@/lib/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { mergePayees } from "../actions";

export const metadata = { title: "Payees · Finance" };

/** Everyone the company pays (K-Electric, Meta, shops, staff): totals, and merging names spelled differently. */
export default async function Payees({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const rows = await db.finEntry.groupBy({ by: ["party"], where: { party: { not: null }, kind: "expense", status: "approved", personal: false }, _sum: { amount: true }, _count: true, _max: { date: true }, orderBy: { _sum: { amount: "desc" } } });
  const list = rows.filter((r) => !q || r.party!.toLowerCase().includes(q));
  // Same name written differently.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(payeeKey(r.party!), [...(groups.get(payeeKey(r.party!)) ?? []), r]);
  const similar = [...groups.values()].filter((g) => g.length > 1);
  const canEdit = can(user, "finance", "edit");
  return (
    <>
      <PageHeader title="Payees" description="Who the company pays, and how much. Merge names written differently so totals are right." />
      {canEdit && similar.length > 0 && (
        <Card className="mb-6 border-amber-200 p-5">
          <h2 className="mb-1 font-semibold">Same payee, different spelling</h2>
          <p className="mb-3 text-sm text-muted">Pick the correct spelling and merge.</p>
          <div className="space-y-3">{similar.slice(0, 20).map((g) => (
            <ActionForm key={g[0]!.party} action={mergePayees} className="flex flex-wrap items-center gap-2 text-sm">
              {g.map((r) => <span key={r.party} className="rounded bg-canvas px-2 py-1">{r.party} <span className="text-xs text-muted">({r._count})</span><input type="hidden" name="names" value={r.party!} /></span>)}
              <span className="text-muted">→</span>
              <select name="to" defaultValue={g.sort((a, b) => b._count - a._count)[0]!.party!} className="input w-auto py-1.5">{g.map((r) => <option key={r.party} value={r.party!}>{r.party}</option>)}</select>
              <SubmitButton>Merge</SubmitButton>
            </ActionForm>
          ))}</div>
        </Card>
      )}
      <AutoFilterForm className="mb-3"><label className="relative block max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input name="q" defaultValue={sp.q} placeholder="Find a payee" className="input pl-9" /></label></AutoFilterForm>
      <Card className="overflow-hidden">
        {canEdit ? (
          <ActionForm action={mergePayees}>
            <PayeeTable list={list} selectable />
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-4 text-sm">Rename / merge ticked payees to <input name="to" placeholder="Correct name, e.g. K-Electric" className="input w-64 py-1.5" /><SubmitButton>Apply</SubmitButton></div>
          </ActionForm>
        ) : <PayeeTable list={list} />}
      </Card>
    </>
  );
}

function PayeeTable({ list, selectable }: { list: { party: string | null; _sum: { amount: number | null }; _count: number; _max: { date: Date | null } }[]; selectable?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr>{selectable && <th className="w-10 px-4 py-2.5" />}<th className="px-4 py-2.5">Payee</th><th className="px-4 py-2.5 text-right">Payments</th><th className="px-4 py-2.5 text-right">Total paid</th><th className="px-4 py-2.5">Last paid</th></tr></thead>
      <tbody className="divide-y divide-line">{list.slice(0, 300).map((r) => (
        <tr key={r.party} className="hover:bg-canvas/50">
          {selectable && <td className="px-4 py-2"><input type="checkbox" name="names" value={r.party!} aria-label={`Select ${r.party}`} /></td>}
          <td className="px-4 py-2"><Link href={`/finance/entries?party=${encodeURIComponent(r.party!)}`} className="font-medium hover:underline">{r.party}</Link></td>
          <td className="px-4 py-2 text-right tabular-nums text-muted">{r._count}</td>
          <td className="px-4 py-2 text-right font-medium tabular-nums">{pkr(r._sum.amount ?? 0)}</td>
          <td className="px-4 py-2 text-muted">{r._max.date ? format(r._max.date, "d MMM yyyy") : "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
