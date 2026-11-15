"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field } from "@/components/ui";
import { saveInvoice } from "@/app/(app)/invoices/actions";

type Line = { description: string; qty: number; rate: number };
export type InvoiceFormValues = {
  id?: string; clientName: string; clientEmail: string; clientPhone: string; clientAddress: string; dealId: string; installmentId: string; contactId: string;
  issueDate: string; dueDate: string; items: Line[]; discount: number; taxPct: number; notes: string; terms: string; repeat: string; approverId: string;
};

const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/** New / edit invoice: client, items with live totals, approver, repeat. */
export function InvoiceForm({ v, approvers, needsApproval }: { v: InvoiceFormValues; approvers: { id: string; name: string }[]; needsApproval: boolean }) {
  const [items, setItems] = useState<Line[]>(v.items.length ? v.items : [{ description: "", qty: 1, rate: 0 }]);
  const [discount, setDiscount] = useState(v.discount);
  const [taxPct, setTaxPct] = useState(v.taxPct);
  const t = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + (i.qty || 0) * (i.rate || 0), 0);
    const d = Math.min(discount || 0, subtotal), tax = (subtotal - d) * ((taxPct || 0) / 100);
    return { subtotal, d, tax, total: subtotal - d + tax };
  }, [items, discount, taxPct]);
  const set = (k: number, patch: Partial<Line>) => setItems((cur) => cur.map((x, i) => (i === k ? { ...x, ...patch } : x)));

  return (
    <ActionForm action={saveInvoice} className="space-y-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {["dealId", "installmentId", "contactId"].map((k) => <input key={k} type="hidden" name={k} value={v[k as "dealId"]} />)}
      <Card className="p-5">
        <h2 className="mb-4 font-medium">Client</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Client name"><input name="clientName" required defaultValue={v.clientName} className="input" /></Field>
          <Field label="Phone (for WhatsApp)"><input name="clientPhone" defaultValue={v.clientPhone} className="input" inputMode="tel" /></Field>
          <Field label="Email (the invoice link is emailed here)"><input name="clientEmail" type="email" defaultValue={v.clientEmail} className="input" /></Field>
          <Field label="Address"><input name="clientAddress" defaultValue={v.clientAddress} className="input" /></Field>
        </div>
      </Card>
      <Card className="p-5">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Invoice date"><input name="issueDate" type="date" required defaultValue={v.issueDate} className="input" /></Field>
          <Field label="Due date"><input name="dueDate" type="date" required defaultValue={v.dueDate} className="input" /></Field>
          <Field label="Repeat" hint="A copy is made automatically each time.">
            <select name="repeat" defaultValue={v.repeat} className="input"><option value="none">Doesn&apos;t repeat</option><option value="monthly">Every month</option><option value="quarterly">Every 3 months</option><option value="yearly">Every year</option></select>
          </Field>
        </div>
        <h2 className="mb-2 font-medium">Items</h2>
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_2rem] gap-2 text-xs font-medium uppercase tracking-wide text-muted sm:grid"><span>Description</span><span>Qty</span><span>Rate (Rs)</span><span className="text-right">Amount</span><span /></div>
          {items.map((it, k) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 rounded-lg border border-line p-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_2rem] sm:border-0 sm:p-0">
              <input value={it.description} onChange={(e) => set(k, { description: e.target.value })} placeholder="e.g. Token money · Unit B-12, Skyline Heights" className="input" aria-label="Description" />
              <button type="button" onClick={() => setItems((cur) => (cur.length > 1 ? cur.filter((_, i) => i !== k) : cur))} className="row-start-1 flex items-center justify-center rounded-md text-muted hover:text-red-600 sm:col-start-5" aria-label="Remove item"><Trash2 className="size-4" /></button>
              <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:contents">
                <input value={it.qty} onChange={(e) => set(k, { qty: Number(e.target.value) })} type="number" min={0} step="any" className="input sm:col-start-2" aria-label="Quantity" />
                <input value={it.rate} onChange={(e) => set(k, { rate: Number(e.target.value) })} type="number" min={0} step="any" className="input sm:col-start-3" aria-label="Rate" />
                <span className="flex items-center justify-end text-sm font-medium tabular-nums sm:col-start-4">{pkr((it.qty || 0) * (it.rate || 0))}</span>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setItems((cur) => [...cur, { description: "", qty: 1, rate: 0 }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-900 hover:underline"><Plus className="size-4" /> Add item</button>
        </div>
        <div className="mt-5 flex flex-col items-end gap-2 border-t border-line pt-4 text-sm">
          <div className="flex w-full max-w-xs justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{pkr(t.subtotal)}</span></div>
          <label className="flex w-full max-w-xs items-center justify-between gap-3"><span className="text-muted">Discount (Rs)</span><input name="discount" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} type="number" min={0} step="any" className="input h-8 w-32 text-right" /></label>
          <label className="flex w-full max-w-xs items-center justify-between gap-3"><span className="text-muted">Tax %</span><input name="taxPct" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} type="number" min={0} step="any" className="input h-8 w-32 text-right" /></label>
          {t.tax > 0 && <div className="flex w-full max-w-xs justify-between"><span className="text-muted">Tax</span><span className="tabular-nums">{pkr(t.tax)}</span></div>}
          <div className="flex w-full max-w-xs justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{pkr(t.total)}</span></div>
        </div>
      </Card>
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Note to the client (optional)"><textarea name="notes" rows={3} defaultValue={v.notes} className="input" /></Field>
          <Field label="Terms"><textarea name="terms" rows={3} defaultValue={v.terms} className="input" /></Field>
        </div>
      </Card>
      <Card className="flex flex-wrap items-end gap-3 p-5">
        {needsApproval && (
          <Field label="Who approves it?" hint="They sign it in AMS before it can be sent.">
            <select name="approverId" defaultValue={v.approverId} className="input w-64">{approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <SubmitButton variant="secondary">Save draft</SubmitButton>
          <button name="submit" value="1" className="inline-flex h-10 items-center justify-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800">{needsApproval ? "Save & send for approval" : "Save & approve"}</button>
        </div>
      </Card>
    </ActionForm>
  );
}
