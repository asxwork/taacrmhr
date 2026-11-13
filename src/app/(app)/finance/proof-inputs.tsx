"use client";
import { useState } from "react";
import { Camera, Paperclip } from "lucide-react";

/** Proof upload: take a photo with the phone camera, or choose files (images / PDF), several at once. */
export function ProofInputs({ required }: { required?: string }) {
  const [names, setNames] = useState<string[]>([]);
  const pick = (e: React.ChangeEvent<HTMLInputElement>, add: boolean) => {
    const list = [...(e.target.files ?? [])].map((f) => f.name);
    setNames((n) => (add ? [...n, ...list] : list));
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
    </div>
  );
}
