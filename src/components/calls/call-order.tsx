"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveCallOrder } from "@/app/(app)/calls/actions";

/** Campaign → Call order: which numbers are called (and put in batches) first. */
export function CallOrder({ campaignId, order, field, desc, fields }: { campaignId: string; order: string; field: string | null; desc: boolean; fields: string[] }) {
  const [o, setO] = useState(order);
  return (
    <ActionForm action={saveCallOrder} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["top", "Top first", "File order"], ["bottom", "Bottom first", "Last row first"], ["random", "Random", "Shuffled"], ["column", "By a column", "Sort by a detail"]] as const).map(([k, l, d]) => (
          <label key={k} className="cursor-pointer">
            <input type="radio" name="order" value={k} checked={o === k} onChange={() => setO(k)} className="peer sr-only" />
            <span className="block rounded-lg border border-line px-3 py-2 text-sm transition hover:bg-canvas peer-checked:border-navy-900 peer-checked:bg-navy-900/[0.05] peer-checked:ring-1 peer-checked:ring-navy-900">
              <b className="block font-medium">{l}</b><span className="text-xs text-muted">{d}</span>
            </span>
          </label>
        ))}
      </div>
      {o === "column" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Sort by
          <select name="field" defaultValue={field ?? ""} required className="input h-9 w-56">
            <option value="">Choose a column…</option>
            {["Name", ...fields].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select name="desc" defaultValue={desc ? "1" : "0"} className="input h-9 w-32"><option value="0">A → Z</option><option value="1">Z → A</option></select>
        </div>
      )}
      <SubmitButton variant="secondary" pendingText="Putting the numbers in order…">Save order</SubmitButton>
      <p className="text-xs text-muted">Decides which numbers go into new batches first and which number each agent gets next. Callbacks due always come first.</p>
    </ActionForm>
  );
}
