import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { uploadAsDataUrl } from "@/lib/files";
import { displayStatus, invoiceConfig, invoiceEvent } from "@/lib/invoices";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { SignaturePad } from "@/components/invoices/signature-pad";
import { PrintButton } from "@/components/print-button";
import { clientSignInvoice } from "./actions";

export const metadata = { title: "Invoice", robots: { index: false } };

/** The client's page: view, download / print and sign the invoice. No login; the long random link is the key. */
export default async function ClientInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = token.length > 20 ? await db.invoice.findUnique({ where: { publicToken: token }, include: { items: { orderBy: { sort: "asc" } } } }) : null;
  if (!inv || !["approved", "sent", "paid"].includes(inv.status)) notFound();
  if (!inv.viewedAt) { await db.invoice.update({ where: { id: inv.id }, data: { viewedAt: new Date() } }); await invoiceEvent(inv.id, null, "viewed"); }
  const [c, company, approver, approverSign, clientSign] = await Promise.all([
    invoiceConfig(), db.setting.findMany({ where: { key: { startsWith: "company." } } }),
    inv.approvedById ? db.user.findUnique({ where: { id: inv.approvedById }, select: { name: true } }) : null,
    uploadAsDataUrl(inv.approverSign), uploadAsDataUrl(inv.clientSign),
  ]);
  const co = (k: string) => company.find((s) => s.key === `company.${k}`)?.value ?? null;
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-[210mm]">
        <div className="mb-4 flex justify-end print:hidden"><PrintButton target="[data-print-area]" fileName={inv.number} /></div>
        <div data-print-area className="rounded-xl bg-white p-5 shadow-sm sm:p-10 print:p-0 print:shadow-none">
          <InvoiceDocument bank={c.bank} company={{ name: co("name") || "The Advisor Associates", address: co("address"), phone: co("phone"), email: co("email") }}
            inv={{ ...inv, statusLabel: displayStatus(inv).label, approverName: approver?.name ?? null, approverSign, clientSign }} />
        </div>
        {!inv.clientSignedAt && (
          <div className="mt-6 rounded-xl bg-white p-5 shadow-sm print:hidden sm:p-8">
            <p className="font-medium">Accept this invoice</p>
            <p className="mb-4 text-sm text-muted">Type your name and sign below to confirm you accept it.</p>
            <ActionForm action={clientSignInvoice} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <input name="name" required defaultValue={inv.clientName} placeholder="Your full name" className="input" aria-label="Your full name" />
              <SignaturePad label="Your signature" />
              <SubmitButton>Sign &amp; accept</SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </main>
  );
}
