"use client";
import { useState } from "react";
import { Camera, Loader2, Paperclip, Sparkles } from "lucide-react";
import { fillForm, readReceipt } from "./read-receipt";

/** Proof upload: take a photo with the phone camera, or choose files (images / PDF), several at once. */
export function ProofInputs({ required }: { required?: string }) {
  const [names, setNames] = useState<string[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>, add: boolean) => {
    const files = [...(e.target.files ?? [])];
    setNames((n) => (add ? [...n, ...files.map((f) => f.name)] : files.map((f) => f.name)));
    // Read the bill and fill amount, payee, description, category, date (only empty fields).
    const first = files.find((f) => /^image\/|pdf$/.test(f.type));
    const form = e.target.form;
    if (first && form?.elements.namedItem("amount")) {
      setReading("Reading the bill…");
      readReceipt(first).then((r) => {
        if (!r) return setReading(null);
        if ("error" in r) return setReading(r.error);
        fillForm(form, r);
        setReading("Filled from the bill. Please check the amount.");
      });
    }
  };
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">Proof <span className="font-normal text-muted">(bill · receipt · screenshot)</span></p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm hover:bg-canvas">
          <Camera className="size-4 text-emerald-600" /> Take photo
          <input type="file" name="photo" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e, true)} />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm hover:bg-canvas">
          <Paperclip className="size-4 text-navy-900" /> Choose files
          <input type="file" name="proofs" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e, true)} />
        </label>
      </div>
      {names.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">{names.map((n, i) => <li key={i} className="flex items-center gap-1.5 truncate rounded bg-emerald-50 px-2 py-1 text-emerald-800"><Paperclip className="size-3 shrink-0" />{n}</li>)}
</ul>
      ) : required && <p className="mt-1.5 text-xs text-muted">{required}</p>}
      {reading && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">{reading.startsWith("Reading") ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}{reading}</p>}
    </div>
  );
}
