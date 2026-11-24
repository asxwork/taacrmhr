"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import type { FormState } from "@/lib/utils";

type Row = { id: string; who: string; outcome: string; notes: string | null; when: string };

/** Dialer → My last calls: the agent's 3 latest calls, each with its remarks and an Edit to fix a mistake. */
export function LastCalls({ rows, action }: { rows: Row[]; action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [state, act, pending] = useActionState(action, undefined);
  useEffect(() => { if (state?.ok) setOpen(null); }, [state]);
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium">{r.who}</span>
            <span className="shrink-0 text-xs text-muted">{r.when}</span>
          </div>
          <p className="text-xs text-muted">{r.outcome}</p>
          {open === r.id ? (
            <form action={act} className="mt-1.5 space-y-1.5">
              <input type="hidden" name="logId" value={r.id} />
              <textarea name="notes" defaultValue={r.notes ?? ""} rows={2} autoFocus className="input text-sm" aria-label="Remarks" />
              <div className="flex gap-2">
                <button disabled={pending} className="h-8 rounded-lg bg-navy-900 px-3 text-xs font-medium text-white hover:bg-navy-800 disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setOpen(null)} className="h-8 rounded-lg px-3 text-xs text-muted hover:bg-canvas">Cancel</button>
              </div>
              {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
            </form>
          ) : (
            <div className="mt-0.5 flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{r.notes || <span className="text-muted">No remarks</span>}</p>
              <button type="button" onClick={() => setOpen(r.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-navy-900 hover:underline"><Pencil className="size-3" /> Edit</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
