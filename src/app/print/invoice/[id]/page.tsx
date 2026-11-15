import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { fileUrl } from "@/lib/files";
import { displayStatus, invoiceConfig } from "@/lib/invoices";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Invoice" };

export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoices");
  const scope = await scopeWhere(user, "invoices");
  const inv = scope ? await db.invoice.findFirst({ where: { AND: [{ id: (await params).id }, scope] }, include: { items: { orderBy: { sort: "asc" } } } }) : null;
  if (!inv) notFound();
  const [c, company, approver] = await Promise.all([invoiceConfig(), db.setting.findMany({ where: { key: { startsWith: "company." } } }), inv.approvedById ? db.user.findUnique({ where: { id: inv.approvedById }, select: { name: true } }) : null]);
  const co = (k: string) => company.find((s) => s.key === `company.${k}`)?.value ?? null;
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-4 sm:p-10 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden"><Link href={`/invoices/${inv.id}`} className="text-sm text-gray-500 hover:underline">← Invoice</Link><PrintButton target="[data-print-area]" fileName={inv.number} /></div>
      <div data-print-area>
        <InvoiceDocument bank={c.bank} company={{ name: co("name") || "The Advisor Associates", address: co("address"), phone: co("phone"), email: co("email") }}
          inv={{ ...inv, statusLabel: displayStatus(inv).label, approverName: approver?.name ?? null, approverSign: inv.approverSign ? fileUrl(inv.approverSign) : null, clientSign: inv.clientSign ? fileUrl(inv.clientSign) : null }} />
      </div>
    </div>
  );
}
