import { format, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { answerSwap, cancelSwap, requestSwap } from "./actions";
import { SWAP_STATUS } from "@/lib/shift-swap";

export const metadata = { title: "Shift swaps" };


/** My Space → Requests → Shift swaps: ask a colleague to swap a day, answer their requests. */
export default async function MySwapsPage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, branchId: true } });
  if (!emp) return <><PageHeader title="Shift swaps" /><Card><EmptyState title="Your login isn't linked to an employee record" /></Card></>;
  const [colleagues, swaps] = await Promise.all([
    db.employee.findMany({ where: { status: { not: "left" }, NOT: { id: emp.id }, userId: { not: null }, ...(emp.branchId ? { branchId: emp.branchId } : {}) }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.shiftSwap.findMany({ where: { OR: [{ requesterId: emp.id }, { partnerId: emp.id }] }, include: { requester: { select: { fullName: true } }, partner: { select: { fullName: true } } }, orderBy: { date: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <PageHeader title="Shift swaps" description="Swap your shift for one day with a colleague. They accept, then your manager approves and the roster updates for both of you." />
      <Card className="mb-4 p-4">
        <ActionForm action={requestSwap} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_1fr_auto] sm:items-end">
          <Field label="Swap with"><select name="partnerId" required className="input"><option value="">Choose a colleague</option>{colleagues.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
          <Field label="Day"><input name="date" type="date" required min={format(startOfDay(new Date()), "yyyy-MM-dd")} className="input" /></Field>
          <Field label="Reason (optional)"><input name="reason" className="input" /></Field>
          <SubmitButton>Ask</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="overflow-hidden">
        {swaps.length === 0 ? <EmptyState title="No swaps yet" /> : (
          <ul className="divide-y divide-line">
            {swaps.map((s) => {
              const mine = s.requesterId === emp.id;
              const [label, tone] = SWAP_STATUS[s.status] ?? [s.status, "neutral"];
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{format(s.date, "EEE d MMM yyyy")} · {mine ? `with ${s.partner.fullName}` : `${s.requester.fullName} asked you`}</p>
                    {s.reason && <p className="text-xs text-muted">{s.reason}</p>}
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                  {!mine && s.status === "partner" && (
                    <span className="flex gap-2">
                      <form action={answerSwap}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="answer" value="yes" /><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700">Accept</button></form>
                      <form action={answerSwap}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="answer" value="no" /><button className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">Decline</button></form>
                    </span>
                  )}
                  {mine && ["partner", "manager"].includes(s.status) && (
                    <form action={cancelSwap}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-muted hover:text-red-600">Cancel</button></form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
