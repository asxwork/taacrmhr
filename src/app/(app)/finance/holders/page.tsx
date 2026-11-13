import Link from "@/components/link";
import { format } from "date-fns";
import { Banknote, CreditCard, Crown, Landmark, Plus, Trash2, User, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ACCOUNT_KINDS, balances, kindLabel, pkr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { deleteHolder, saveHolder } from "../actions";

export const metadata = { title: "Money holders · Finance" };
const HEAD = "Head office (DHA)";
const ICON = { petty: Wallet, person: User, owner: Crown, bank: Landmark, card: CreditCard } as const;

/** Finance → Money holders: who holds or spends company money, with live balances. */
export default async function HoldersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const [list, last] = await Promise.all([
    balances(),
    db.finEntry.groupBy({ by: ["accountId"], _max: { date: true } }),
  ]);
  const editing = sp.edit && sp.edit !== "new" ? list.find((a) => a.id === sp.edit) : undefined;
  const canEdit = can(user, "finance", "edit");
  const branches = [HEAD, ...[...new Set(list.map((a) => a.branch).filter((b): b is string => !!b && b !== HEAD))].sort()];

  return (
    <>
      <PageHeader title="Money holders" description="Everyone who holds or spends company money. Balance = opening + money in + transfers in − spent − transfers out."
        actions={can(user, "finance", "create") && <Link href="/finance/holders?edit=new" scroll={false} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> Add holder</Link>} />
      {list.length === 0 ? <Card><EmptyState title="No money holders yet" description="Add Bushra (petty cash), Samad (marketing), Mubeen sir (owner), the company bank… or import your Excel sheet." /></Card> : (
        <div className="space-y-8">{branches.map((br) => { const inBranch = list.filter((a) => (a.branch || HEAD) === br); const total = inBranch.reduce((s, a) => s + a.balance, 0); return (
        <section key={br}>
        <div className="mb-3 flex items-baseline justify-between"><h2 className="font-semibold">{br}</h2><span className="text-sm text-muted">Cash with this office: <b className={cn("tabular-nums", total < 0 ? "text-red-600" : "text-ink")}>{pkr(total)}</b></span></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {inBranch.map((a) => {
            const Icon = ICON[a.kind as keyof typeof ICON] ?? Banknote;
            const lastDate = last.find((l) => l.accountId === a.id)?._max.date;
            return (
              <Card key={a.id} className={cn("flex flex-col p-5", !a.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-navy-900 text-white"><Icon className="size-5" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.name}</p><p className="text-xs text-muted">{kindLabel(a.kind)}{!a.active && " · hidden"}</p></div>
                  {canEdit && <Link href={`/finance/holders?edit=${a.id}`} scroll={false} className="text-xs font-medium text-navy-900 hover:underline">Edit</Link>}
                </div>
                <p className={cn("mt-4 text-3xl font-semibold tabular-nums", a.balance < 0 ? "text-red-600" : "")}>{pkr(a.balance)}</p>
                <p className="text-xs text-muted">{a.balance < 0 ? "Spent more than received: the company owes them" : "Balance in hand"}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                  <span><span className="block text-muted">Received</span><b className="tabular-nums text-emerald-700">{pkr(a.received + a.opening)}</b></span>
                  <span><span className="block text-muted">Spent / given</span><b className="tabular-nums">{pkr(a.spent)}</b></span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{lastDate ? `Last entry ${format(lastDate, "d MMM yyyy")}` : "No entries yet"}</span>
                  <Link href={`/finance/entries?holder=${a.id}`} className="font-medium text-navy-900 hover:underline">Entries →</Link>
                </div>
              </Card>
            );
          })}
        </div>
        </section>); })}</div>
      )}
      {sp.edit && canEdit && (
        <Drawer title={editing ? `Edit ${editing.name}` : "Add money holder"} closeHref="/finance/holders" width="max-w-md">
          <ActionForm action={saveHolder} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name"><input name="name" required defaultValue={editing?.name} className="input" placeholder="e.g. Bushra (petty cash)" autoFocus /></Field>
            <Field label="Type"><select name="kind" defaultValue={editing?.kind ?? "person"} className="input">{ACCOUNT_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Office / branch" hint="Leave empty for the head office. e.g. Bahadurabad"><input name="branch" list="fin-branches" defaultValue={editing?.branch ?? ""} className="input" /><datalist id="fin-branches">{branches.slice(1).map((b) => <option key={b} value={b} />)}<option value="Bahadurabad" /></datalist></Field>
            <Field label="Opening balance (Rs)" hint="Money they already held before AMS"><input name="opening" inputMode="decimal" defaultValue={editing?.opening ?? 0} className="input" /></Field>
            <Field label="Notes"><input name="notes" defaultValue={editing?.notes ?? ""} className="input" /></Field>
            {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing.active} className="accent-navy-900" /> Active (shows in forms)</label>}
            <SubmitButton>{editing ? "Save" : "Add"}</SubmitButton>
          </ActionForm>
          {editing && can(user, "finance", "delete") && (
            <ActionForm action={deleteHolder} className="mt-6 border-t border-line pt-4 text-sm">
              <input type="hidden" name="id" value={editing.id} />
              <button className="inline-flex items-center gap-1.5 text-red-600 hover:underline"><Trash2 className="size-4" /> Delete holder (only if it has no entries)</button>
            </ActionForm>
          )}
        </Drawer>
      )}
    </>
  );
}
