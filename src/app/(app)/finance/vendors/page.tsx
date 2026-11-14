import Link from "@/components/link";
import { format, isBefore, startOfDay } from "date-fns";
import { Paperclip, X } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { categoryTree, pkr } from "@/lib/finance";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { ProofInputs } from "../proof-inputs";
import { cancelPayable, payPayable, savePayable } from "../actions";

export const metadata = { title: "Supplier bills · Finance" };

/** What the company owes suppliers, and a statement per supplier (bills and payments). */
export default async function Vendors({ searchParams }: { searchParams: Promise<{ party?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const [open, tree, holders, payees] = await Promise.all([
    db.finPayable.findMany({ where: { status: "open", ...(sp.party && { party: sp.party }) }, orderBy: [{ dueDate: "asc" }, { billDate: "asc" }] }),
    categoryTree(),
    db.finAccount.findMany({ where: { active: true, kind: { not: "owner" } }, orderBy: { name: "asc" } }),
    db.finEntry.groupBy({ by: ["party"], where: { party: { not: null } }, _count: true, orderBy: { _count: { party: "desc" } }, take: 300 }),
  ]);
  const owed = await db.finPayable.groupBy({ by: ["party"], where: { status: "open" }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } } });
  const statement = sp.party ? await Promise.all([
    db.finPayable.findMany({ where: { party: sp.party, status: { not: "cancelled" } }, orderBy: { billDate: "desc" } }),
    db.finEntry.findMany({ where: { party: sp.party, kind: "expense", status: "approved" }, orderBy: { date: "desc" }, take: 50 }),
  ]) : null;
  const today = startOfDay(new Date());
  const canAdd = can(user, "finance", "create");
  return (
    <>
      <PageHeader title="Supplier bills" description="Bills received but not paid yet (water, stationery, maintenance, portals…). Pay them here with the bill attached." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {owed.length > 0 && !sp.party && (
            <Card className="p-4"><p className="mb-2 text-sm font-medium">Owed to suppliers: <b>{pkr(owed.reduce((s, o) => s + (o._sum.amount ?? 0), 0))}</b></p>
              <div className="flex flex-wrap gap-2">{owed.map((o) => <Link key={o.party} href={`/finance/vendors?party=${encodeURIComponent(o.party)}`} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-canvas">{o.party} · <b className="tabular-nums">{pkr(o._sum.amount ?? 0)}</b></Link>)}</div></Card>
          )}
          {sp.party && <p className="text-sm">Supplier <b>{sp.party}</b> · <Link href="/finance/vendors" className="text-navy-900 hover:underline">all suppliers</Link></p>}
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Unpaid bills <span className="text-sm font-normal text-muted">{open.length}</span></h2>
            <ul className="divide-y divide-line">{open.map((p) => {
              const late = p.dueDate && isBefore(p.dueDate, today);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><Link href={`/finance/vendors?party=${encodeURIComponent(p.party)}`} className="font-medium hover:underline">{p.party}</Link><p className="text-xs text-muted">{p.description} · bill {format(p.billDate, "d MMM")}{p.dueDate && <span className={cn(late && "font-medium text-red-600")}> · {late ? "overdue since" : "due"} {format(p.dueDate, "d MMM")}</span>}</p></div>
                  {p.proof ? <a href={fileUrl(p.proof)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"><Paperclip className="size-3" />Bill</a> : <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">No bill</span>}
                  <span className="w-24 text-right font-semibold tabular-nums">{pkr(p.amount)}</span>
                  {canAdd && <ActionForm action={payPayable} className="flex items-center gap-1"><input type="hidden" name="id" value={p.id} /><select name="accountId" required aria-label="Pay from" className="input w-auto py-1.5 text-sm"><option value="">Pay from…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select><SubmitButton>Pay</SubmitButton></ActionForm>}
                  {can(user, "finance", "delete") && <form action={cancelPayable}><input type="hidden" name="id" value={p.id} /><ConfirmButton message="Cancel this bill?" title="Cancel bill" className="p-1 text-muted hover:text-red-600"><X className="size-4" /></ConfirmButton></form>}
                </li>
              );
            })}{open.length === 0 && <li className="px-4 py-4 text-sm text-muted">Nothing unpaid.</li>}</ul>
          </Card>
          {statement && (
            <Card className="overflow-hidden">
              <h2 className="border-b border-line px-4 py-3 font-semibold">Statement · {sp.party}</h2>
              <table className="w-full text-sm"><thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">What</th><th className="px-4 py-2 text-right">Bill</th><th className="px-4 py-2 text-right">Paid</th></tr></thead>
                <tbody className="divide-y divide-line">{[...statement[0].map((b) => ({ d: b.billDate, k: "b" + b.id, what: `Bill: ${b.description}${b.status === "open" ? " (unpaid)" : ""}`, bill: b.amount, paid: 0, href: null as string | null })), ...statement[1].map((e) => ({ d: e.date, k: "e" + e.id, what: e.description, bill: 0, paid: e.amount, href: `/finance/entries/${e.id}` }))].sort((a, b) => b.d.getTime() - a.d.getTime()).map((r) => (
                  <tr key={r.k}><td className="px-4 py-2 text-muted">{format(r.d, "d MMM yyyy")}</td><td className="px-4 py-2">{r.href ? <Link href={r.href} className="hover:underline">{r.what}</Link> : r.what}</td><td className="px-4 py-2 text-right tabular-nums">{r.bill ? pkr(r.bill) : ""}</td><td className="px-4 py-2 text-right tabular-nums text-emerald-700">{r.paid ? pkr(r.paid) : ""}</td></tr>
                ))}</tbody></table>
            </Card>
          )}
        </div>
        {canAdd && (
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Add a supplier bill</h2>
            <ActionForm action={savePayable} className="space-y-3">
              <Field label="Supplier"><input name="party" list="fin-vendors" required defaultValue={sp.party} className="input" placeholder="e.g. Nestle water" /><datalist id="fin-vendors">{payees.map((p) => <option key={p.party} value={p.party!} />)}</datalist></Field>
              <Field label="What for"><input name="description" className="input" placeholder="e.g. 20 bottles, October" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Amount (Rs)"><input name="amount" required inputMode="decimal" className="input" /></Field><Field label="Bill date"><input name="billDate" type="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} className="input" /></Field></div>
              <Field label="Pay by (optional)"><input name="dueDate" type="date" className="input" /></Field>
              <Field label="Category"><select name="categoryId" className="input"><option value="">Choose…</option>{tree.filter((c) => !c.personal).map((c) => <optgroup key={c.id} label={c.name}><option value={c.id}>{c.name} (general)</option>{c.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</select></Field>
              <ProofInputs />
              <SubmitButton>Save bill</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
