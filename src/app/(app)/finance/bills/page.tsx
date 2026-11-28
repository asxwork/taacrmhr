import Link from "@/components/link";
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, isBefore, isSameDay, isSameMonth, parse, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { disabledFeatures } from "@/lib/features";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { billsForMonth, categoryTree, pkr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { saveBill } from "../actions";

export const metadata = { title: "Monthly bills · Finance" };

/** Bills that come every month: what's paid, what's due, one click to record this month's payment with the bill. */
export default async function Bills({ searchParams }: { searchParams: Promise<{ month?: string; edit?: string; view?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? parse(sp.month, "yyyy-MM", new Date()) : new Date();
  const [bills, tree, holders, all] = await Promise.all([
    billsForMonth(month), categoryTree(),
    db.finAccount.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.finRecurring.findMany({ where: { active: false }, orderBy: { name: "asc" } }),
  ]);
  const editing = sp.edit && sp.edit !== "new" ? await db.finRecurring.findUnique({ where: { id: sp.edit } }) : null;
  const canAdd = can(user, "finance", "create");
  const today = startOfDay(new Date());
  const unpaid = bills.filter((b) => !b.paid);
  const calendar = sp.view === "calendar" && !(await disabledFeatures()).has("fin-billcalendar");
  const nav = (d: Date) => `/finance/bills?month=${format(d, "yyyy-MM")}${calendar ? "&view=calendar" : ""}`;
  // Calendar: monthly bills on their due day plus supplier bills (Vendors) by due date.
  const payables = calendar ? await db.finPayable.findMany({ where: { status: { not: "cancelled" }, dueDate: { gte: startOfMonth(month), lte: endOfMonth(month) } }, orderBy: { dueDate: "asc" } }) : [];
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const cells = Array.from({ length: Math.ceil((differenceInCalendarDays(endOfMonth(month), gridStart) + 1) / 7) * 7 }, (_, i) => addDays(gridStart, i));
  return (
    <>
      <PageHeader title="Monthly bills" description="K-Electric, rent, internet, Meta ads, hosting… Approvers get a reminder 3 days before each is due and on the day."
        actions={<div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
            <Link href={nav(subMonths(month, 1))} aria-label="Previous month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronLeft className="size-4" /></Link>
            <span className="min-w-28 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
            <Link href={nav(addMonths(month, 1))} aria-label="Next month" className="rounded-md p-1.5 text-muted hover:bg-canvas"><ChevronRight className="size-4" /></Link>
          </div>
          <div className="flex rounded-lg border border-line bg-surface p-1 text-sm">
            <Link href={`/finance/bills?month=${format(month, "yyyy-MM")}`} className={cn("rounded-md px-2.5 py-1", !calendar ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>List</Link>
            <Link href={`/finance/bills?month=${format(month, "yyyy-MM")}&view=calendar`} className={cn("rounded-md px-2.5 py-1", calendar ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>Calendar</Link>
          </div>
          {canAdd && <Link href="/finance/bills?edit=new" scroll={false} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> Add bill</Link>}
        </div>} />
      {bills.length > 0 && <p className="mb-4 text-sm">{unpaid.length ? <><b>{unpaid.length} not paid yet</b> · {pkr(unpaid.reduce((s, b) => s + b.amount, 0))} expected</> : <span className="text-emerald-700">All bills recorded for {format(month, "MMMM")}.</span>}</p>}
      {calendar && (
        <Card className="mb-6 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-canvas/60 text-center text-xs font-medium text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map((d) => {
              const dayBills = bills.filter((b) => isSameDay(b.due, d));
              const dayPay = payables.filter((p) => p.dueDate && isSameDay(p.dueDate, d));
              const inMonth = isSameMonth(d, month);
              return (
                <div key={+d} className={cn("min-h-24 border-b border-r border-line p-1.5 text-xs", !inMonth && "bg-canvas/40 text-muted", isSameDay(d, today) && "bg-sky-50")}>
                  <p className={cn("mb-1 font-medium", isSameDay(d, today) && "text-sky-700")}>{format(d, "d")}</p>
                  {inMonth && dayBills.map((b) => {
                    const late = !b.paid && isBefore(b.due, today);
                    return <Link key={b.id} href={b.paidEntry ? `/finance/entries/${b.paidEntry.id}` : canAdd ? `/finance/entries?bill=${b.id}` : "#"} title={`${b.name} · ${pkr(b.amount)}`} className={cn("mb-1 block truncate rounded px-1.5 py-0.5", b.paid ? "bg-emerald-50 text-emerald-800" : late ? "bg-red-50 font-medium text-red-700" : "bg-amber-50 text-amber-800")}>{b.paid ? "✓ " : ""}{b.name} · {pkr(b.amount)}</Link>;
                  })}
                  {inMonth && dayPay.map((p) => {
                    const late = p.status === "open" && isBefore(p.dueDate!, today);
                    return <Link key={p.id} href="/finance/vendors" title={`${p.party}: ${p.description}`} className={cn("mb-1 block truncate rounded border px-1.5 py-0.5", p.status === "paid" ? "border-emerald-200 text-emerald-800" : late ? "border-red-300 font-medium text-red-700" : "border-amber-300 text-amber-800")}>{p.status === "paid" ? "✓ " : ""}{p.party} · {pkr(p.amount)}</Link>;
                  })}
                </div>
              );
            })}
          </div>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">Filled = monthly bills, outlined = supplier bills. Green paid, amber due, red overdue. Approvers get a reminder 3 days before and again on the due day.</p>
        </Card>
      )}
      <Card className="overflow-hidden">
        {bills.length === 0 ? <EmptyState title="No monthly bills yet" description="Add one here, or open any entry (e.g. a K-Electric payment) and click “Make it a monthly bill”." /> : (
          <ul className="divide-y divide-line">{bills.map((b) => {
            const late = !b.paid && isBefore(b.due, today);
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <span className={cn("flex size-10 items-center justify-center rounded-lg", b.paid ? "bg-emerald-50 text-emerald-600" : late ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700")}>{b.paid ? <Check className="size-5" /> : <CalendarClock className="size-5" />}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/finance/bills?edit=${b.id}&month=${format(month, "yyyy-MM")}`} scroll={false} className="font-medium hover:underline">{b.name}</Link>
                  <p className="text-xs text-muted">Every month on the {b.dayOfMonth}{[, "st", "nd", "rd"][b.dayOfMonth % 10 > 3 || (b.dayOfMonth > 10 && b.dayOfMonth < 14) ? 0 : b.dayOfMonth % 10] ?? "th"} · {b.category ? (b.category.parent ? `${b.category.parent.name} › ${b.category.name}` : b.category.name) : "No category"}{b.account && ` · paid by ${b.account.name}`}</p>
                </div>
                <span className={cn("text-xs", b.paid ? "text-emerald-700" : late ? "font-medium text-red-600" : "text-amber-700")}>{b.paid ? (b.paidEntry ? `Paid ${format(b.paidEntry.date, "d MMM")}` : "Paid") : late ? `Overdue since ${format(b.due, "d MMM")}` : `Due ${format(b.due, "d MMM")}`}</span>
                <span className="w-28 text-right font-semibold tabular-nums">{pkr(b.paidEntry?.amount ?? b.amount)}</span>
                <span className="w-36 text-right">{b.paidEntry ? <Link href={`/finance/entries/${b.paidEntry.id}`} className="text-sm text-navy-900 hover:underline">View + bill →</Link>
                  : canAdd && <Link href={`/finance/entries?bill=${b.id}`} className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800">Record payment</Link>}</span>
              </li>
            );
          })}</ul>
        )}
      </Card>
      {all.length > 0 && <p className="mt-3 text-xs text-muted">Stopped: {all.map((b) => <Link key={b.id} href={`/finance/bills?edit=${b.id}`} className="mr-2 hover:underline">{b.name}</Link>)}</p>}
      {sp.edit && canAdd && (
        <Drawer title={editing ? `Edit ${editing.name}` : "Add monthly bill"} closeHref="/finance/bills" width="max-w-md">
          <ActionForm action={saveBill} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Bill"><input name="name" required defaultValue={editing?.name} placeholder="e.g. K-Electric (DHA office)" className="input" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Usual amount (Rs)"><input name="amount" required inputMode="decimal" defaultValue={editing?.amount} className="input" /></Field>
              <Field label="Due on day"><input name="dayOfMonth" type="number" min={1} max={31} required defaultValue={editing?.dayOfMonth ?? 10} className="input" /></Field>
            </div>
            <Field label="Category"><select name="categoryId" defaultValue={editing?.categoryId ?? ""} className="input"><option value="">Choose…</option>{tree.filter((c) => !c.personal).map((c) => <optgroup key={c.id} label={c.name}><option value={c.id}>{c.name} (general)</option>{c.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</select></Field>
            <Field label="Usually paid by"><select name="accountId" defaultValue={editing?.accountId ?? ""} className="input"><option value="">Choose…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            <Field label="Paid to"><input name="party" defaultValue={editing?.party ?? ""} placeholder="e.g. K-Electric" className="input" /></Field>
            <Field label="Notes (account / consumer no.)"><input name="notes" defaultValue={editing?.notes ?? ""} className="input" /></Field>
            {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing.active} /> Active (untick to stop it)</label>}
            <SubmitButton>{editing ? "Save" : "Add bill"}</SubmitButton>
          </ActionForm>
          {editing && <ActionForm action={saveBill} className="mt-6 border-t border-line pt-4"><input type="hidden" name="id" value={editing.id} /><input type="hidden" name="op" value="delete" /><button className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline"><Trash2 className="size-4" /> Remove bill (payments already recorded stay)</button></ActionForm>}
        </Drawer>
      )}
    </>
  );
}
