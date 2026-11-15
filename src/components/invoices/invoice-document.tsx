import { format } from "date-fns";
import { pkr } from "@/lib/finance";
import { rupeesInWords } from "@/lib/words";

export type InvoiceDoc = {
  number: string; status: string; statusLabel: string; clientName: string; clientEmail: string | null; clientPhone: string | null; clientAddress: string | null;
  issueDate: Date; dueDate: Date; items: { description: string; qty: number; rate: number; amount: number }[];
  subtotal: number; discount: number; taxPct: number; taxAmount: number; total: number; paidAmount: number; notes: string | null; terms: string | null;
  approverName: string | null; approvedAt: Date | null; approverSign: string | null;
  clientSign: string | null; clientSignedName: string | null; clientSignedAt: Date | null;
};

/** The invoice itself, as printed, as a PDF and on the client's link. */
export function InvoiceDocument({ inv, company, bank }: { inv: InvoiceDoc; company: { name: string; address?: string | null; phone?: string | null; email?: string | null }; bank?: string }) {
  const due = inv.total - inv.paidAmount;
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  return (
    <div className="bg-white text-[13px] text-gray-900">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-gray-900 pb-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon.png" alt="" className="size-14 rounded" />
          <div>
            <p className="text-lg font-semibold">{company.name}</p>
            {company.address && <p className="text-xs text-gray-500">{company.address}</p>}
            <p className="text-xs text-gray-500">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-2xl font-semibold tracking-tight">INVOICE</p>
          <p className="font-mono text-sm">{inv.number}</p>
          <p className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">{inv.statusLabel}</p>
        </div>
      </header>
      <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Bill to</p>
          <p className="mt-1 font-medium">{inv.clientName}</p>
          {inv.clientAddress && <p className="whitespace-pre-line text-gray-600">{inv.clientAddress}</p>}
          <p className="text-gray-600">{[inv.clientPhone, inv.clientEmail].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="sm:text-right">
          <p><span className="text-gray-500">Invoice date:</span> {format(inv.issueDate, "d MMM yyyy")}</p>
          <p><span className="text-gray-500">Due date:</span> <b>{format(inv.dueDate, "d MMM yyyy")}</b></p>
          <p className="mt-2 text-lg font-semibold">{pkr(due > 0.5 ? due : inv.total)}</p>
          <p className="text-xs text-gray-500">{due > 0.5 ? (inv.paidAmount ? "Still due" : "Amount due") : "Paid in full"}</p>
        </div>
      </section>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-gray-300 text-left text-[11px] uppercase text-gray-500"><th className="py-2 pr-2">Description</th><th className="hidden w-16 py-2 text-right sm:table-cell print:table-cell">Qty</th><th className="hidden w-28 py-2 text-right sm:table-cell print:table-cell">Rate</th><th className="w-32 py-2 text-right">Amount</th></tr></thead>
          <tbody>{inv.items.map((i, k) => <tr key={k} className="border-b border-gray-100"><td className="py-2 pr-2">{i.description}{i.qty !== 1 && <span className="block text-xs text-gray-500 sm:hidden print:hidden">{n(i.qty)} × {pkr(i.rate)}</span>}</td><td className="hidden py-2 text-right tabular-nums sm:table-cell print:table-cell">{n(i.qty)}</td><td className="hidden py-2 text-right tabular-nums sm:table-cell print:table-cell">{pkr(i.rate)}</td><td className="py-2 text-right tabular-nums">{pkr(i.amount)}</td></tr>)}</tbody>
        </table>
      </div>
      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1">
          <div className="flex justify-between"><dt className="text-gray-500">Subtotal</dt><dd className="tabular-nums">{pkr(inv.subtotal)}</dd></div>
          {inv.discount > 0 && <div className="flex justify-between"><dt className="text-gray-500">Discount</dt><dd className="tabular-nums">−{pkr(inv.discount)}</dd></div>}
          {inv.taxPct > 0 && <div className="flex justify-between"><dt className="text-gray-500">Tax {n(inv.taxPct)}%</dt><dd className="tabular-nums">{pkr(inv.taxAmount)}</dd></div>}
          <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{pkr(inv.total)}</dd></div>
          {inv.paidAmount > 0 && <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd className="tabular-nums">−{pkr(inv.paidAmount)}</dd></div>}
          {inv.paidAmount > 0 && due > 0.5 && <div className="flex justify-between font-semibold"><dt>Due</dt><dd className="tabular-nums">{pkr(due)}</dd></div>}
        </dl>
      </section>
      <p className="mt-2 text-right text-xs italic text-gray-500">{rupeesInWords(inv.total)}</p>
      {(inv.notes || inv.terms || bank) && (
        <section className="mt-6 grid grid-cols-1 gap-4 text-xs text-gray-600 sm:grid-cols-2">
          {(inv.notes || inv.terms) && <div>{inv.notes && <p className="mb-2 whitespace-pre-line">{inv.notes}</p>}{inv.terms && <><p className="font-semibold uppercase tracking-wide text-gray-500">Terms</p><p className="whitespace-pre-line">{inv.terms}</p></>}</div>}
          {bank && <div><p className="font-semibold uppercase tracking-wide text-gray-500">Pay to</p><p className="whitespace-pre-line">{bank}</p></div>}
        </section>
      )}
      <section className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="flex h-16 items-end">{inv.approverSign ? <img src={inv.approverSign} alt="Approver signature" className="max-h-16" /> : null}</div>
          <div className="border-t border-gray-400 pt-1 text-xs"><p className="font-medium">Authorised signature</p><p className="text-gray-500">{inv.approverName ? `${inv.approverName}${inv.approvedAt ? ` · ${format(inv.approvedAt, "d MMM yyyy")}` : ""}` : " "}</p></div>
        </div>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="flex h-16 items-end">{inv.clientSign ? <img src={inv.clientSign} alt="Client signature" className="max-h-16" /> : null}</div>
          <div className="border-t border-gray-400 pt-1 text-xs"><p className="font-medium">Client acceptance</p><p className="text-gray-500">{inv.clientSignedName ? `${inv.clientSignedName}${inv.clientSignedAt ? ` · ${format(inv.clientSignedAt, "d MMM yyyy")}` : ""}` : " "}</p></div>
        </div>
      </section>
    </div>
  );
}
