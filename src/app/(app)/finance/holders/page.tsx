import Link from "@/components/link";
import { format } from "date-fns";
import { Banknote, CreditCard, Crown, Landmark, Plus, Trash2, User, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ACCOUNT_KINDS, balances, holderLimit, kindLabel, pkr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { decideTopup, deleteHolder, requestTopup, saveHolder, settleHolder } from "../actions";

export const metadata = { title: "Money holders · Finance" };
const HEAD = "Head office (DHA)";
const ICON = { petty: Wallet, person: User, owner: Crown, bank: Landmark, card: CreditCard } as const;

/** Finance → Money holders: who holds or spends company money, with live balances. */
export default async function HoldersPage({ searchParams }: { searchParams: Promise<{ edit?: string; topup?: string; settle?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const hLimit = holderLimit(user);
  const allowed = hLimit ? new Set((await db.finAccount.findMany({ where: hLimit, select: { id: true } })).map((a) => a.id)) : null;
  const [all, last, topups, branchRows] = await Promise.all([
    balances(),
    db.finEntry.groupBy({ by: ["accountId"], _max: { date: true } }),
    db.finTopup.findMany({ where: { status: "pending", ...(allowed && { accountId: { in: [...allowed] } }) }, include: { account: true }, orderBy: { createdAt: "asc" } }),
    db.branch.findMany({ select: { name: true } }),
  ]);
  const list = allowed ? all.filter((a) => allowed.has(a.id)) : all;
  const requesters = await db.user.findMany({ where: { id: { in: topups.map((t) => t.requestedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const canApprove = can(user, "finance", "approve"), canAdd = can(user, "finance", "create");
  const topupFor = sp.topup ? list.find((a) => a.id === sp.topup) : undefined;
  const settleFor = sp.settle ? list.find((a) => a.id === sp.settle) : undefined;
  const editing = sp.edit && sp.edit !== "new" ? list.find((a) => a.id === sp.edit) : undefined;
  const canEdit = can(user, "finance", "edit");
  const branches = [HEAD, ...[...new Set(list.map((a) => a.branch).filter((b): b is string => !!b && b !== HEAD))].sort()];

  return (
    <>
      <PageHeader title="Money holders" description="Everyone who holds or spends company money. Balance = opening + money in + transfers in − spent − transfers out."
        actions={can(user, "finance", "create") && <Link href="/finance/holders?edit=new" scroll={false} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> Add holder</Link>} />
      {topups.length > 0 && (
        <Card className="mb-6 overflow-hidden border-amber-200">
          <h2 className="border-b border-line bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">Top-up requests</h2>
          <ul className="divide-y divide-line">{topups.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1"><b>{pkr(t.amount)}</b> for {t.account.name}<span className="block text-xs text-muted">{requesters.find((r) => r.id === t.requestedById)?.name ?? "—"} · {format(t.createdAt, "d MMM, h:mm a")}{t.note && ` · ${t.note}`}</span></span>
              {canApprove ? <>
                <form action={decideTopup} className="flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="approve" />
                  <input name="amount" defaultValue={t.amount} inputMode="decimal" aria-label="Amount" className="input w-28 py-1.5" />
                  <select name="fromId" aria-label="Paid from" className="input w-auto py-1.5"><option value="">From outside (owner / bank)</option>{list.filter((a) => a.id !== t.accountId && a.active).map((a) => <option key={a.id} value={a.id}>From {a.name}</option>)}</select>
                  <button className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700">Approve</button>
                </form>
                <form action={decideTopup}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="reject" /><button className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-red-600">Reject</button></form>
              </> : <span className="text-xs text-amber-700">Waiting for approval</span>}
            </li>
          ))}</ul>
        </Card>
      )}
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
                <p className={cn("mt-4 text-3xl font-semibold tabular-nums", a.kind !== "owner" && a.balance < 0 ? "text-red-600" : "")}>{a.kind === "owner" && a.balance < 0 ? pkr(-a.balance) : pkr(a.balance)}</p>
                <p className="flex items-center gap-2 text-xs text-muted">{a.kind === "owner" && a.balance < 0 ? "Own money put into the company" : a.balance < 0 ? "Spent more than received: the company owes them" : "Balance in hand"}
                  {a.lowAlert != null && a.balance < a.lowAlert && <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">Low cash</span>}</p>
                {canAdd && a.active && a.kind !== "owner" && (
                  <div className="mt-3 flex gap-2 text-xs">
                    {a.kind === "petty" && <Link href={`/finance/holders?topup=${a.id}`} scroll={false} className="rounded-md border border-line px-2.5 py-1 hover:bg-canvas">Request top-up</Link>}
                    {a.balance < 0 && <Link href={`/finance/holders?settle=${a.id}`} scroll={false} className="rounded-md border border-line px-2.5 py-1 hover:bg-canvas">Pay back {pkr(-a.balance)}</Link>}
                  </div>
                )}
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
      {topupFor && canAdd && (
        <Drawer title={`Request top-up for ${topupFor.name}`} closeHref="/finance/holders" width="max-w-md">
          <p className="mb-4 text-sm text-muted">Balance now: <b className="text-ink">{pkr(topupFor.balance)}</b>. The approvers get a notification.</p>
          <ActionForm action={requestTopup} className="space-y-4">
            <input type="hidden" name="accountId" value={topupFor.id} />
            <Field label="Amount needed (Rs)"><input name="amount" required inputMode="decimal" className="input" autoFocus /></Field>
            <Field label="Why (optional)"><input name="note" className="input" placeholder="e.g. Salaries and K-Electric this week" /></Field>
            <SubmitButton>Send request</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
      {settleFor && canAdd && (
        <Drawer title={`Pay back ${settleFor.name}`} closeHref="/finance/holders" width="max-w-md">
          <p className="mb-4 text-sm text-muted">The company owes {settleFor.name} <b className="text-ink">{pkr(-settleFor.balance)}</b> (they paid from their own pocket). This records the payment back as a transfer; attach the transfer screenshot on the next page.</p>
          <ActionForm action={settleHolder} className="space-y-4">
            <input type="hidden" name="id" value={settleFor.id} />
            <Field label="Paid back from"><select name="fromId" required className="input"><option value="">Choose…</option>{list.filter((a) => a.id !== settleFor.id && a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Amount (Rs)"><input name="amount" required inputMode="decimal" defaultValue={Math.round(-settleFor.balance)} className="input" /></Field>
            <Field label="Note (optional)"><input name="note" className="input" /></Field>
            <SubmitButton>Record payment</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
      {sp.edit && canEdit && (
        <Drawer title={editing ? `Edit ${editing.name}` : "Add money holder"} closeHref="/finance/holders" width="max-w-md">
          <ActionForm action={saveHolder} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name"><input name="name" required defaultValue={editing?.name} className="input" placeholder="e.g. Bushra (petty cash)" autoFocus /></Field>
            <Field label="Type"><select name="kind" defaultValue={editing?.kind ?? "person"} className="input">{ACCOUNT_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Office / branch" hint="Leave empty for the head office. Use the same name as the branch in Company & Branches, so branch staff see only their office."><input name="branch" list="fin-branches" defaultValue={editing?.branch ?? ""} className="input" /><datalist id="fin-branches">{branches.slice(1).map((b) => <option key={b} value={b} />)}{branchRows.filter((b) => !branches.includes(b.name)).map((b) => <option key={b.name} value={b.name} />)}<option value="Bahadurabad" /></datalist></Field>
            <Field label="Opening balance (Rs)" hint="Money they already held before AMS"><input name="opening" inputMode="decimal" defaultValue={editing?.opening ?? 0} className="input" /></Field>
            <Field label="Low cash alert below (Rs)" hint="Approvers get a notification when the balance drops below this. Empty = no alert."><input name="lowAlert" inputMode="decimal" defaultValue={editing?.lowAlert ?? ""} className="input" /></Field>
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
