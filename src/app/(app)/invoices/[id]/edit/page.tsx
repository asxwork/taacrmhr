import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { invoiceApprovers, invoiceConfig } from "@/lib/invoices";
import { PageHeader } from "@/components/ui";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoices", "edit");
  const scope = await scopeWhere(user, "invoices", "edit");
  const inv = scope ? await db.invoice.findFirst({ where: { AND: [{ id: (await params).id }, scope] }, include: { items: { orderBy: { sort: "asc" } } } }) : null;
  if (!inv || ["paid", "void"].includes(inv.status)) notFound();
  const [c, approvers] = await Promise.all([invoiceConfig(), invoiceApprovers()]);
  return (
    <>
      <PageHeader title={`Edit ${inv.number}`} description={["approved", "sent", "pending"].includes(inv.status) ? "Saving changes sends it back for approval." : undefined} />
      <InvoiceForm needsApproval approvers={approvers} v={{
        id: inv.id, clientName: inv.clientName, clientEmail: inv.clientEmail ?? "", clientPhone: inv.clientPhone ?? "", clientAddress: inv.clientAddress ?? "", dealId: inv.dealId ?? "", installmentId: inv.installmentId ?? "", contactId: inv.contactId ?? "",
        issueDate: format(inv.issueDate, "yyyy-MM-dd"), dueDate: format(inv.dueDate, "yyyy-MM-dd"), items: inv.items.map((i) => ({ description: i.description, qty: i.qty, rate: i.rate })),
        discount: inv.discount, taxPct: inv.taxPct, notes: inv.notes ?? "", terms: inv.terms ?? "", repeat: inv.repeat, approverId: inv.approverId ?? c.approverIds[0] ?? approvers[0]?.id ?? "",
      }} />
    </>
  );
}
