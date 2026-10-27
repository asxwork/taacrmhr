import Link from "next/link";
import { notFound } from "next/navigation";
import { format, isPast, startOfDay } from "date-fns";
import { ArrowLeft, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm";
import { FREQUENCIES, PAYMENT_METHODS } from "@/lib/inventory";
import { cn, fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { recordPayment, savePaymentPlan, undoPayment } from "../../payment-actions";

export const metadata = { title: "Payment plan" };

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("crm.deals");
  const { id } = await params;
  const scope = (await scopeWhere(user, "crm.deals"))!;
  const deal = await db.deal.findFirst({
    where: { id, ...scope },
    include: {
      contact: true,
      paymentPlan: { include: { items: { orderBy: { seq: "asc" } } } },
      units: { include: { unit: { include: { project: true } } } },
    },
  });
  if (!deal) notFound();

  const canEdit = can(user, "crm.deals", "edit") && (await scopeMatcher(user, "crm.deals", "edit"))(deal);
  const plan = deal.paymentPlan;
  const items = plan?.items ?? [];
  const paid = items.reduce((s, i) => s + i.paidAmount, 0);
  const total = plan?.total ?? 0;
  const today = startOfDay(new Date());
  const overdue = items.filter((i) => i.paidAmount < i.amount && i.dueDate < today);
  const overdueAmount = overdue.reduce((s, i) => s + i.amount - i.paidAmount, 0);
  const locked = items.some((i) => i.paidAmount > 0);

  // Defaults: existing plan → linked unit's project plan → sensible fallback.
  const project = deal.units.find((u) => u.unit.project)?.unit.project;
  const d = {
    total: plan?.total ?? deal.value ?? "",
    downPct: plan?.downPct ?? project?.planDownPct ?? 25,
    installments: plan?.installments ?? project?.planInstallments ?? 12,
    frequency: plan?.frequency ?? project?.planFrequency ?? "monthly",
    possessionPct: plan?.possessionPct ?? project?.planPossessionPct ?? 0,
    startDate: format(plan?.startDate ?? new Date(), "yyyy-MM-dd"),
  };

  return (
    <>
      <Link href={`/crm/deals/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {deal.title}
      </Link>
      <PageHeader title="Payment plan" description={deal.contact ? `Client: ${deal.contact.name}` : undefined} />

      {plan && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4"><p className="text-xs text-muted">Total</p><p className="mt-1 text-xl font-semibold">{fmtPKR(total)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted">Received</p><p className="mt-1 text-xl font-semibold text-emerald-700">{fmtPKR(paid)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted">Balance</p><p className="mt-1 text-xl font-semibold">{fmtPKR(total - paid)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted">Overdue</p><p className={cn("mt-1 text-xl font-semibold", overdue.length && "text-red-600")}>{overdue.length} · {fmtPKR(overdueAmount)}</p></Card>
        </div>
      )}

      {canEdit && !locked && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 text-sm font-medium">{plan ? "Regenerate schedule" : "Create schedule"}</h2>
          <ActionForm action={savePaymentPlan} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <input type="hidden" name="dealId" value={id} />
            <Field label="Total (PKR)"><input name="total" defaultValue={d.total} required className="input" /></Field>
            <Field label="Down payment %"><input name="downPct" type="number" step="0.1" defaultValue={d.downPct} required className="input" /></Field>
            <Field label="Installments"><input name="installments" type="number" min={0} defaultValue={d.installments} required className="input" /></Field>
            <Field label="Every">
              <select name="frequency" defaultValue={d.frequency} className="input">
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
            <Field label="On possession %"><input name="possessionPct" type="number" step="0.1" defaultValue={d.possessionPct} className="input" /></Field>
            <Field label="Start date"><input name="startDate" type="date" defaultValue={d.startDate} required className="input" /></Field>
            <div className="sm:col-span-3 lg:col-span-6">
              <SubmitButton>{plan ? "Regenerate" : "Generate schedule"}</SubmitButton>
              {project && !plan && <span className="ml-3 text-xs text-muted">Pre-filled from {project.name}’s standard plan.</span>}
            </div>
          </ActionForm>
        </Card>
      )}

      {plan ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60">
                <tr>
                  <th className="th">Installment</th>
                  <th className="th">Due</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Received</th>
                  <th className="th">Status</th>
                  {canEdit && <th className="th">Record payment</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => {
                  const done = i.paidAmount >= i.amount;
                  const late = !done && isPast(i.dueDate) && i.dueDate < today;
                  return (
                    <tr key={i.id} className={late ? "bg-red-50/40" : undefined}>
                      <td className="td font-medium">{i.label}</td>
                      <td className="td whitespace-nowrap text-muted">{fmtDate(i.dueDate)}</td>
                      <td className="td whitespace-nowrap text-right">{fmtPKR(i.amount, { prefix: false })}</td>
                      <td className="td whitespace-nowrap text-right">{i.paidAmount ? fmtPKR(i.paidAmount, { prefix: false }) : "—"}</td>
                      <td className="td">
                        {done ? <Badge tone="green">Paid {fmtDate(i.paidAt)}</Badge> : late ? <Badge tone="red">Overdue</Badge> : i.paidAmount > 0 ? <Badge tone="amber">Part paid</Badge> : <Badge>Upcoming</Badge>}
                        {i.method && <span className="ml-1.5 text-xs text-muted">{i.method}{i.reference ? ` · ${i.reference}` : ""}</span>}
                      </td>
                      {canEdit && (
                        <td className="td">
                          {done ? (
                            <form action={undoPayment}>
                              <input type="hidden" name="installmentId" value={i.id} />
                              <button className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600"><Undo2 className="size-3.5" /> Undo</button>
                            </form>
                          ) : (
                            <ActionForm action={recordPayment} className="flex flex-wrap items-center gap-1.5">
                              <input type="hidden" name="installmentId" value={i.id} />
                              <input name="amount" defaultValue={i.amount - i.paidAmount} className="input h-8 w-28 text-xs" aria-label="Amount" />
                              <input name="paidAt" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} className="input h-8 w-36 text-xs" aria-label="Date" />
                              <select name="method" className="input h-8 w-32 text-xs" aria-label="Method">
                                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                              </select>
                              <input name="reference" placeholder="Ref / cheque #" className="input h-8 w-28 text-xs" />
                              <SubmitButton variant="secondary" className="h-8 text-xs">Save</SubmitButton>
                            </ActionForm>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        !canEdit && <Card className="p-6 text-sm text-muted">No payment plan yet.</Card>
      )}
    </>
  );
}
