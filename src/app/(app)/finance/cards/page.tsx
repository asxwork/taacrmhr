import Link from "@/components/link";
import { CreditCard, Plus } from "lucide-react";
import { startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { pkr } from "@/lib/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { saveCard, toggleCard } from "../actions";

export const metadata = { title: "Company cards · Finance" };

/** Finance → Cards: the company's payment cards, and what was spent on each this month. */
export default async function CardsPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const canEdit = can(user, "finance.settings", "edit");
  const month = startOfMonth(new Date());
  const [cards, holders, spend, total] = await Promise.all([
    db.finCard.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.finAccount.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.finEntry.groupBy({ by: ["cardId"], where: { cardId: { not: null }, kind: "expense", status: "approved", personal: false, date: { gte: month } }, _sum: { amount: true }, _count: true }),
    db.finEntry.groupBy({ by: ["cardId"], where: { cardId: { not: null }, kind: "expense", status: "approved", personal: false }, _sum: { amount: true } }),
  ]);
  const editing = sp.edit ? cards.find((c) => c.id === sp.edit) : null;
  const of = (id: string) => spend.find((s) => s.cardId === id);
  return (
    <>
      <PageHeader title="Company cards" description="The company's payment cards. When adding an expense, pick which card paid; here you see what was spent on each card this month."
        actions={canEdit && <LinkButton href="/finance/cards?new=1" scroll={false}><Plus className="size-4" /> Add card</LinkButton>} />
      {cards.length === 0 ? <Card><EmptyState title="No cards yet" description="Add the company's debit and credit cards (name, last 4 digits, who holds it)." /></Card> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const m = of(c.id);
            const used = m?._sum.amount ?? 0;
            return (
              <Card key={c.id} className={`overflow-hidden ${c.active ? "" : "opacity-60"}`}>
                <div className={`p-5 text-white ${c.kind === "credit" ? "bg-gradient-to-br from-slate-800 to-slate-950" : "bg-gradient-to-br from-navy-800 to-navy-950"}`}>
                  <div className="flex items-start justify-between"><CreditCard className="size-6 opacity-80" /><span className="text-xs uppercase tracking-wider opacity-70">{c.kind}</span></div>
                  <p className="mt-6 font-mono text-lg tracking-widest">•••• •••• •••• {c.last4 ?? "····"}</p>
                  <div className="mt-2 flex items-end justify-between text-sm"><span className="font-medium">{c.name}</span><span className="opacity-80">{c.holder ?? ""}</span></div>
                </div>
                <div className="space-y-2 p-4 text-sm">
                  <div className="flex justify-between"><span className="text-muted">Spent this month</span><b className="tabular-nums">{pkr(used)}</b></div>
                  {c.limit && <><div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className={`h-full rounded-full ${used > c.limit ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (used / c.limit) * 100)}%` }} /></div><p className="text-xs text-muted">Monthly limit {pkr(c.limit)}{used > c.limit ? " · over the limit" : ""}</p></>}
                  <div className="flex justify-between text-xs text-muted"><span>{m?._count ?? 0} expense(s) this month · {pkr(total.find((t) => t.cardId === c.id)?._sum.amount ?? 0)} in all</span>{c.accountId && <span>{holders.find((h) => h.id === c.accountId)?.name}</span>}</div>
                  <div className="flex gap-3 pt-1 text-xs">
                    <Link href={`/finance/entries?card=${c.id}`} className="font-medium text-navy-900 hover:underline dark:text-ink">See expenses</Link>
                    {canEdit && <Link href={`/finance/cards?edit=${c.id}`} scroll={false} className="text-muted hover:text-ink">Edit</Link>}
                    {canEdit && <form action={toggleCard}><input type="hidden" name="id" value={c.id} /><button className="text-muted hover:text-ink">{c.active ? "Switch off" : "Switch on"}</button></form>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {canEdit && (sp.new || editing) && (
        <Drawer title={editing ? "Edit card" : "Add a card"} closeHref="/finance/cards">
          <ActionForm action={saveCard} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name"><input name="name" required defaultValue={editing?.name} placeholder="e.g. Meezan Visa, HBL Mastercard" className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Last 4 digits"><input name="last4" inputMode="numeric" maxLength={4} defaultValue={editing?.last4 ?? ""} placeholder="1234" className="input" /></Field>
              <Field label="Type"><select name="kind" defaultValue={editing?.kind ?? "debit"} className="input"><option value="debit">Debit</option><option value="credit">Credit</option></select></Field>
            </div>
            <Field label="Held by"><input name="holder" defaultValue={editing?.holder ?? ""} placeholder="e.g. Mubeen sir, Samad" className="input" /></Field>
            <Field label="Spends from (money holder, optional)"><select name="accountId" defaultValue={editing?.accountId ?? ""} className="input"><option value="">—</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            <Field label="Monthly limit (optional)"><input name="limit" inputMode="decimal" defaultValue={editing?.limit ?? ""} placeholder="e.g. 500000" className="input" /></Field>
            <p className="text-xs text-muted">Only the last 4 digits are kept: never type the full card number.</p>
            <SubmitButton>{editing ? "Save" : "Add card"}</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
