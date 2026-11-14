"use client";
import { useState } from "react";
import { Camera, Check, Loader2, Sparkles } from "lucide-react";
import { fillForm, readReceipt } from "../read-receipt";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type Cat = { id: string; name: string; group: string };

/** The quick-add fields: big camera button, big amount, category chips (most used first). */
export function QuickForm({ top, all, holders, defaultHolder, payees }: { top: Cat[]; all: Cat[]; holders: { id: string; name: string }[]; defaultHolder: string; payees: string[] }) {
  const [cat, setCat] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const { pending } = useFormStatus();
  return (
    <>
      <label className={cn("flex h-36 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-sm", photo ? "border-emerald-400" : "border-line bg-surface")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="Bill" className="h-full w-full object-cover" /> : <><Camera className="size-9 text-emerald-600" /><span className="font-medium">Take a photo of the bill</span></>}
        <input type="file" name="photo" accept="image/*" capture="environment" className="sr-only" onChange={(e) => {
          const f = e.target.files?.[0]; const form = e.target.form;
          setPhoto(f ? URL.createObjectURL(f) : null);
          if (!f) return;
          setReading("Reading the bill…");
          readReceipt(f).then((r) => {
            if (!r) return setReading(null);
            if ("error" in r) return setReading(r.error);
            fillForm(form, r); if (r.categoryId) setCat(r.categoryId);
            setReading("Filled from the bill. Check the amount, then save.");
          });
        }} />
      </label>
      {reading && <p className="-mt-2 flex items-center gap-1.5 text-sm text-emerald-700">{reading.startsWith("Reading") ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{reading}</p>}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Amount</span>
        <span className="flex items-center rounded-2xl border border-line bg-surface px-4"><span className="text-xl text-muted">Rs</span><input name="amount" required inputMode="decimal" placeholder="0" className="w-full bg-transparent px-3 py-4 text-3xl font-semibold tabular-nums outline-none" /></span>
      </label>
      <div>
        <span className="mb-2 block text-sm font-medium">Category</span>
        <div className="flex flex-wrap gap-2">{top.map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} className={cn("rounded-full border px-3.5 py-2 text-sm", cat === c.id ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface")}>{cat === c.id && <Check className="mr-1 inline size-3.5" />}{c.name}</button>
        ))}</div>
        <select name="categoryId" required value={cat} onChange={(e) => setCat(e.target.value)} className="input mt-2"><option value="">{top.length ? "Other category…" : "Choose category…"}</option>{all.map((c) => <option key={c.id} value={c.id}>{c.group === c.name ? c.name : `${c.group} › ${c.name}`}</option>)}</select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="mb-1 block text-sm font-medium">Paid by</span><select name="accountId" required defaultValue={defaultHolder} className="input">{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Paid to</span><input name="party" list="quick-payees" autoComplete="off" className="input" placeholder="Shop / person" /><datalist id="quick-payees">{payees.map((p) => <option key={p} value={p} />)}</datalist></label>
      </div>
      <label className="block"><span className="mb-1 block text-sm font-medium">What for <span className="font-normal text-muted">(optional)</span></span><input name="description" className="input" placeholder="e.g. Tea for guests" /></label>
      <button type="submit" disabled={pending} className="w-full rounded-2xl bg-navy-900 py-4 text-lg font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save expense"}</button>
    </>
  );
}
