import { format } from "date-fns";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { db } from "@/lib/db";
import { invoiceApprovers, invoiceConfig } from "@/lib/invoices";
import { PageHeader } from "@/components/ui";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export const metadata = { title: "New invoice" };

/** New invoice. From a deal (?deal=…&installment=…) the client and the installment are filled in. */
export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ deal?: string; installment?: string }> }) {
  const user = await requirePermission("invoices", "create");
  const sp = await searchParams;
  const [c, approvers] = await Promise.all([invoiceConfig(), invoiceApprovers()]);
  const today = new Date();
  let client = { clientName: "", clientEmail: "", clientPhone: "", clientAddress: "", dealId: "", installmentId: "", contactId: "" };
  let items = [{ description: "", qty: 1, rate: 0 }];
  let due = new Date(today.getTime() + c.dueDays * 86_400_000);
  if (sp.deal) {
    const dealScope = await scopeWhere(user, "crm.deals");
    const deal = dealScope ? await db.deal.findFirst({ where: { AND: [{ id: sp.deal }, dealScope] }, include: { contact: true, lead: true, paymentPlan: { include: { items: { orderBy: { seq: "asc" } } } } } }) : null;
    if (deal) {
      const who = deal.contact ?? deal.lead;
      client = { clientName: who?.name ?? deal.title, clientEmail: who?.email ?? "", clientPhone: who?.phone ?? "", clientAddress: "", dealId: deal.id, installmentId: "", contactId: deal.contact?.id ?? "" };
      const inst = deal.paymentPlan?.items.find((i) => i.id === sp.installment) ?? deal.paymentPlan?.items.find((i) => i.paidAmount < i.amount);
      if (inst) { client.installmentId = inst.id; items = [{ description: `${deal.title} · ${inst.label}`, qty: 1, rate: inst.amount - inst.paidAmount }]; due = inst.dueDate > today ? inst.dueDate : due; }
      else items = [{ description: deal.title, qty: 1, rate: deal.value ?? 0 }];
    }
  }
  return (
    <>
      <PageHeader title="New invoice" description="Fill in the client and items. Save as a draft, or send it for approval straight away." />
      <InvoiceForm needsApproval approvers={approvers} v={{ ...client, issueDate: format(today, "yyyy-MM-dd"), dueDate: format(due, "yyyy-MM-dd"), items, discount: 0, taxPct: c.taxPct, notes: "", terms: c.terms, repeat: "none", approverId: c.approverIds[0] ?? approvers.find((a) => !a.isSuperAdmin)?.id ?? approvers[0]?.id ?? "" }} />
    </>
  );
}
