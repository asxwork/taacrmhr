/** Bill details (bill no., vendor NTN and phone, tax, anything else). Filled from the bill photo when it can be read. */
export function BillFields({ d }: { d: { billNo?: string | null; vendorNtn?: string | null; vendorPhone?: string | null; taxAmount?: number | null; billDetails?: string | null } | null }) {
  const open = !!(d?.billNo || d?.vendorNtn || d?.vendorPhone || d?.taxAmount || d?.billDetails);
  return (
    <details data-bill open={open} className="group rounded-lg border border-line px-3 py-2">
      <summary className="cursor-pointer select-none text-sm font-medium">Bill details <span className="font-normal text-muted">(optional · filled from the bill photo)</span></summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-sm">Bill / invoice no.<input name="billNo" defaultValue={d?.billNo ?? ""} className="input mt-1" /></label>
        <label className="block text-sm">Tax on the bill (Rs)<input name="taxAmount" inputMode="decimal" defaultValue={d?.taxAmount ?? ""} className="input mt-1" /></label>
        <label className="block text-sm">Vendor NTN<input name="vendorNtn" defaultValue={d?.vendorNtn ?? ""} className="input mt-1" /></label>
        <label className="block text-sm">Vendor phone<input name="vendorPhone" defaultValue={d?.vendorPhone ?? ""} className="input mt-1" /></label>
        <label className="col-span-2 block text-sm">Other bill details<textarea name="billDetails" rows={3} defaultValue={d?.billDetails ?? ""} placeholder="Items, address, anything else on the bill" className="input mt-1" /></label>
      </div>
    </details>
  );
}
