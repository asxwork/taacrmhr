"use client";

import { useRef } from "react";
import { Building2, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SIZE_UNITS, UNIT_TYPES } from "@/lib/inventory-shared";
import type { FormState } from "@/lib/utils";

const req = <span className="text-red-600">*</span>;

/** Dialer → Listing (CSR agents): the person on the call wants to sell or rent out a property; adds it to Inventory. */
export function ListingButton({ action, targetId, name, phone }: { action: (s: FormState, fd: FormData) => Promise<FormState>; targetId: string; name: string | null; phone: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => dlg.current?.showModal()} className="flex h-14 items-center gap-2 rounded-xl border border-navy-900/25 px-5 font-semibold text-navy-900 hover:bg-navy-50 dark:text-ink">
        <Building2 className="size-5" /> Listing
      </button>
      <dialog ref={dlg} className="w-[min(640px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="font-semibold">Add a listing to Inventory</p>
          <button type="button" onClick={() => dlg.current?.close()} className="rounded-md p-1 text-muted hover:bg-canvas" aria-label="Close"><X className="size-4" /></button>
        </div>
        <ActionForm action={action} className="grid max-h-[75vh] grid-cols-2 gap-3 overflow-y-auto p-5 text-sm">
          <input type="hidden" name="targetId" value={targetId} />
          <label className="col-span-2 sm:col-span-1">For {req}
            <select name="listingType" className="input mt-1" defaultValue="resale"><option value="resale">Sale (resale)</option><option value="rental">Rent</option></select>
          </label>
          <label className="col-span-2 sm:col-span-1">Property type {req}
            <select name="type" required className="input mt-1" defaultValue=""><option value="" disabled>Choose…</option>{UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="col-span-2 sm:col-span-1">Unit / plot / house no. {req}<input name="unitNo" required className="input mt-1" placeholder="e.g. Plot 45, Apt 1203" /></label>
          <label className="col-span-2 sm:col-span-1">Area / society {req}<input name="area" required className="input mt-1" placeholder="e.g. DHA Phase 6, Dubai Marina" /></label>
          <label className="col-span-2">Address<input name="address" className="input mt-1" placeholder="Street, block, building" /></label>
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <label className="flex-1">Size {req}<input name="size" required inputMode="decimal" className="input mt-1" placeholder="e.g. 10" /></label>
            <label className="w-28">Unit<select name="sizeUnit" className="input mt-1" defaultValue="marla">{SIZE_UNITS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
          </div>
          <label className="col-span-2 sm:col-span-1">Demand / rent {req}<input name="price" required className="input mt-1" placeholder="e.g. 2.5 crore, 150000" /></label>
          <label>Bedrooms<input name="bedrooms" inputMode="numeric" className="input mt-1" /></label>
          <label>Bathrooms<input name="bathrooms" inputMode="numeric" className="input mt-1" /></label>
          <label className="col-span-2 sm:col-span-1">Owner&apos;s name {req}<input name="propertyOwner" required defaultValue={name ?? ""} className="input mt-1" /></label>
          <label className="col-span-2 sm:col-span-1">Owner&apos;s phone {req}<input name="propertyOwnerPhone" required defaultValue={phone} className="input mt-1" /></label>
          <label className="col-span-2">Notes<textarea name="notes" rows={2} className="input mt-1" placeholder="Condition, floor, facing, when it's free to see…" /></label>
          <div className="col-span-2 flex items-center gap-3">
            <SubmitButton className="h-10 px-6">Add listing</SubmitButton>
            <span className="text-xs text-muted">Fields with {req} are required. You&apos;re its responsible person in Inventory.</span>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
