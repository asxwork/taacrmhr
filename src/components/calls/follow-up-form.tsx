"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import type { FormState } from "@/lib/utils";

/** History → Add: a later remark on a call, optionally with a new result (saved as a new call). */
export function FollowUpForm({ action, logId, outcomes, hasNumber }: { action: (s: FormState, fd: FormData) => Promise<FormState>; logId: string; outcomes: { value: string; label: string }[]; hasNumber: boolean }) {
  const [state, act, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);
  const [o, setO] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state?.ok) { setOpen(false); setO(""); } }, [state]);
  return (
    <div ref={box} className="relative">
      {state?.ok && !open && <span className="mr-2 text-xs text-emerald-700">{state.message}</span>}
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium hover:bg-canvas" title="Add a remark (they replied or called again)"><MessageSquarePlus className="size-3.5" /> Add</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <form action={act} className="w-full max-w-sm space-y-2 rounded-xl border border-line bg-surface p-4 text-left shadow-2xl">
          <input type="hidden" name="logId" value={logId} />
          <p className="text-sm font-semibold">Add to this call</p>
          <p className="text-xs text-muted">They replied or called again? Add a remark, or log the new result as a new call.</p>
          {hasNumber && (
            <select name="outcome" value={o} onChange={(e) => setO(e.target.value)} className="input h-9 text-sm" aria-label="New result">
              <option value="">Remark only (no new call)</option>
              {outcomes.map((x) => <option key={x.value} value={x.value}>New call: {x.label}</option>)}
            </select>
          )}
          {o === "callback" && <input type="datetime-local" name="callbackAt" required className="input h-9 text-sm" aria-label="Call back at" />}
          <textarea name="notes" rows={3} required={!o || o === "interested"} placeholder={o === "interested" ? "Required: what they want, budget, area…" : "What they said"} className="input text-sm" />
          {o === "interested" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="toCrm" defaultChecked /> Send to the CRM as a lead</label>}
          {state?.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="h-8 rounded-lg bg-navy-900 px-3 text-xs font-medium text-white hover:bg-navy-800 disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg px-2 text-xs text-muted hover:text-ink">Cancel</button>
          </div>
        </form>
        </div>
      )}
    </div>
  );
}
