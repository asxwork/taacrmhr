import Link from "@/components/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2, Copy as CopyIcon, ExternalLink, Pencil, Printer, Send, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { fileUrl } from "@/lib/files";
import { balances, pkr } from "@/lib/finance";
import { displayStatus, invoiceApprovers, invoiceConfig, publicUrl } from "@/lib/invoices";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { SignaturePad } from "@/components/invoices/signature-pad";
import { ShareButtons } from "@/components/invoices/share-buttons";
import { approveInvoice, duplicateInvoice, recordInvoicePayment, rejectInvoice, sendInvoiceEmail, submitInvoice, voidInvoice } from "../actions";

export const metadata = { title: "Invoice" };

const EVENT: Record<string, string> = { created: "Created", edited: "Edited", submitted: "Sent for approval", approved: "Approved", rejected: "Sent back", sent: "Sent to client", viewed: "Client opened it", signed: "Client signed", payment: "Payment", reminder: "Reminder sent", cancelled: "Cancelled" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoices");
  const scope = await scopeWhere(user, "invoices");
  const inv = scope ? await db.invoice.findFirst({ where: { AND: [{ id: (await params).id }, scope] }, include: { items: { orderBy: { sort: "asc" } }, payments: { orderBy: { date: "desc" } }, events: { orderBy: { at: "desc" }, take: 40 } } }) : null;
  if (!inv) notFound();
  const ids = [inv.ownerId, inv.approverId, inv.approvedById, ...inv.events.map((e) => e.userId)].filter((x): x is string => !!x);
  const [people, c, approvers, company, holders] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    invoiceConfig(), invoiceApprovers(),
    db.setting.findMany({ where: { key: { in: ["company.name", "company.address", "company.phone", "company.email"] } } }),
    can(user, "finance", "create") ? balances().then((b) => b.filter((h) => h.active && h.kind !== "owner" && h.kind !== "card")) : Promise.resolve([]),
  ]);
  const who = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const co = (k: string) => company.find((s) => s.key === `company.${k}`)?.value ?? null;
  const st = displayStatus(inv);
  const canEdit = can(user, "invoices", "edit") && !["paid", "void"].includes(inv.status);
  const canApprove = inv.status === "pending" && can(user, "invoices", "approve") && (inv.approverId === user.id || user.isSuperAdmin);
  const link = publicUrl(inv.publicToken);
  const due = inv.total - inv.paidAmount;
  return (
    <>
      <PageHeader eyebrow="Invoice" title={inv.number} description={`${inv.clientName} · ${pkr(inv.total)} · made by ${who(inv.ownerId) ?? "—"}`}
        actions={<div className="flex flex-wrap gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><Printer className="size-4" /> Print / PDF</a>
          {canEdit && <Link href={`/invoices/${inv.id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><Pencil className="size-4" /> Edit</Link>}
          {can(user, "invoices", "create") && <form action={duplicateInvoice}><input type="hidden" name="id" value={inv.id} /><button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><CopyIcon className="size-4" /> Duplicate</button></form>}
        </div>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="p-5 sm:p-8">
          <InvoiceDocument company={{ name: co("name") || "The Advisor Associates", address: co("address"), phone: co("phone"), email: co("email") }} bank={c.bank}
            inv={{ ...inv, statusLabel: st.label, approverName: who(inv.approvedById), approverSign: inv.approverSign ? fileUrl(inv.approverSign) : null, clientSign: inv.clientSign ? fileUrl(inv.clientSign) : null }} />
        </Card>
        <div className="space-y-4">
          {inv.status === "rejected" && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><b>Sent back:</b> {inv.rejectReason}</p>}
          {["draft", "rejected"].includes(inv.status) && canEdit && (
            <Card className="p-4">
              <p className="mb-3 font-medium">Send for approval</p>
              <ActionForm action={submitInvoice} className="space-y-3">
                <input type="hidden" name="id" value={inv.id} />
                <select name="approverId" defaultValue={inv.approverId ?? c.approverIds[0] ?? ""} className="input">{approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <SubmitButton className="w-full"><Send className="size-4" /> Send for approval</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {inv.status === "pending" && (canApprove ? (
            <Card className="p-4">
              <p className="mb-1 font-medium">Your approval</p>
              <p className="mb-3 text-sm text-muted">Check the invoice, then sign to approve it.</p>
              <ActionForm action={approveInvoice} className="space-y-3">
                <input type="hidden" name="id" value={inv.id} />
                <SignaturePad label="Your signature" />
                <SubmitButton className="w-full"><CheckCircle2 className="size-4" /> Sign &amp; approve</SubmitButton>
              </ActionForm>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-red-600">Send back for changes</summary>
                <ActionForm action={rejectInvoice} className="mt-2 space-y-2"><input type="hidden" name="id" value={inv.id} /><textarea name="reason" rows={2} required placeholder="What needs changing?" className="input" /><SubmitButton variant="secondary">Send back</SubmitButton></ActionForm>
              </details>
            </Card>
          ) : <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Waiting for <b>{who(inv.approverId) ?? "approval"}</b> to sign.</p>)}
          {["approved", "sent"].includes(inv.status) && (
            <Card className="space-y-3 p-4">
              <p className="font-medium">Send to the client</p>
              <ShareButtons id={inv.id} url={link} phone={inv.clientPhone} text={`Dear ${inv.clientName}, here is invoice ${inv.number} for ${pkr(inv.total)}, due ${format(inv.dueDate, "d MMM yyyy")}. You can view, sign and download it here:`} />
              {inv.clientEmail && <ActionForm action={sendInvoiceEmail}><input type="hidden" name="id" value={inv.id} /><SubmitButton variant="secondary" className="w-full"><Send className="size-4" /> Email to {inv.clientEmail}</SubmitButton></ActionForm>}
              <a href={link} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-muted hover:underline"><ExternalLink className="size-3" /> See what the client sees</a>
              <p className="text-xs text-muted">{inv.sentAt ? `Sent ${format(inv.sentAt, "d MMM, h:mm a")}` : "Not sent yet"}{inv.viewedAt ? ` · opened ${format(inv.viewedAt, "d MMM")}` : ""}{inv.clientSignedAt ? ` · signed by client ${format(inv.clientSignedAt, "d MMM")}` : ""}</p>
            </Card>
          )}
          {["approved", "sent"].includes(inv.status) && canEdit && due > 0.5 && (
            <Card className="p-4">
              <p className="mb-3 font-medium">Record a payment</p>
              <ActionForm action={recordInvoicePayment} className="space-y-3">
                <input type="hidden" name="id" value={inv.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Amount (Rs)"><input name="amount" defaultValue={Math.round(due)} inputMode="decimal" required className="input" /></Field>
                  <Field label="Date"><input name="date" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} className="input" /></Field>
                  <Field label="How"><select name="method" className="input"><option>Bank transfer</option><option>Cash</option><option>Cheque</option><option>Online</option></select></Field>
                  <Field label="Reference"><input name="reference" placeholder="Cheque / TID" className="input" /></Field>
                </div>
                {holders.length > 0 && <Field label="Received into (Finance)" hint="Adds it to Finance as money in."><select name="holderId" className="input"><option value="">Don&apos;t add to Finance</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>}
                <SubmitButton className="w-full">Record payment</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {inv.payments.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 font-medium">Payments</p>
              <ul className="space-y-1.5 text-sm">{inv.payments.map((p) => <li key={p.id} className="flex justify-between gap-2"><span className="text-muted">{format(p.date, "d MMM yyyy")}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}</span><span className="tabular-nums text-emerald-700">{pkr(p.amount)}</span></li>)}</ul>
            </Card>
          )}
          <Card className="p-4">
            <p className="mb-2 font-medium">History</p>
            <ol className="space-y-2 text-sm">{inv.events.map((e) => <li key={e.id}><span className="font-medium">{EVENT[e.action] ?? e.action}</span>{e.note && <span className="text-muted"> · {e.note}</span>}<span className="block text-xs text-muted">{format(e.at, "d MMM yyyy, h:mm a")}{e.userId ? ` · ${who(e.userId) ?? ""}` : ""}</span></li>)}</ol>
          </Card>
          {can(user, "invoices", "delete") && inv.paidAmount === 0 && inv.status !== "void" && (
            <form action={voidInvoice}><input type="hidden" name="id" value={inv.id} /><button className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-red-600"><Trash2 className="size-4" /> {inv.status === "draft" ? "Delete draft" : "Cancel invoice"}</button></form>
          )}
        </div>
      </div>
    </>
  );
}
