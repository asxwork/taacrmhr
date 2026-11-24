"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { FormState } from "@/lib/utils";

const boxes = (form: string) => [...document.querySelectorAll<HTMLInputElement>(`input[form="${form}"][name="ids"]`)];
const changed = (form: string) => document.dispatchEvent(new Event(`${form}-change`));

/** Tick box on a row (outside the bar's form, joined to it with form=…). */
export function BulkTick({ form, id, label }: { form: string; id: string; label: string }) {
  return <input type="checkbox" name="ids" value={id} form={form} aria-label={`Select ${label}`} className="accent-navy-900" onChange={() => changed(form)} />;
}
/** "Select all on this page" box for the table header. */
export function BulkAll({ form }: { form: string }) {
  return <input type="checkbox" aria-label="Select all" data-all={form} className="accent-navy-900" onChange={(e) => { for (const b of boxes(form)) b.checked = e.target.checked; changed(form); }} />;
}

/** Sticky bar once rows are ticked: pick an action (and, for some, a person), Apply. */
export function BulkBar({ form, action, ops, people = [], noun }: {
  form: string; action: (s: FormState, fd: FormData) => Promise<FormState>; noun: string;
  ops: { value: string; label: string; danger?: boolean; needsPerson?: boolean }[]; people?: { id: string; name: string }[];
}) {
  const [count, setCount] = useState(0);
  const [op, setOp] = useState("");
  const [state, act, pending] = useActionState(action, undefined);
  useEffect(() => {
    const update = () => setCount(boxes(form).filter((b) => b.checked).length);
    document.addEventListener(`${form}-change`, update);
    return () => document.removeEventListener(`${form}-change`, update);
  }, [form]);
  const clear = () => { for (const b of boxes(form)) b.checked = false; document.querySelectorAll<HTMLInputElement>(`input[data-all="${form}"]`).forEach((b) => (b.checked = false)); setCount(0); };
  useEffect(() => { if (state?.ok) { clear(); setOp(""); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = ops.find((o) => o.value === op);
  return (
    <>
      {state?.message && !count && <p role="status" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg">{state.message}</p>}
      <form id={form} action={act} onSubmit={(e) => { if (chosen?.danger && !confirm(`${chosen.label}: ${count} ${noun}? This can't be undone.`)) e.preventDefault(); }}
        className={count ? "sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-xl" : "hidden"}>
        <span className="mr-1 text-sm font-medium tabular-nums">{count} selected</span>
        <select name="op" value={op} onChange={(e) => setOp(e.target.value)} required className="input h-9 w-auto min-w-52 pr-8" aria-label="Bulk action">
          <option value="">Choose action…</option>
          {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {chosen?.needsPerson && (
          <select name="value" required className="input h-9 w-56" aria-label="Agent" key={op}>
            <option value="">Choose agent…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button type="submit" disabled={!op || pending} className={`h-9 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50 ${chosen?.danger ? "bg-red-600 hover:bg-red-700" : "bg-navy-900 hover:bg-navy-800"}`}>{pending ? "Applying…" : "Apply"}</button>
        {state?.error && <span role="alert" className="text-sm text-red-600">{state.error}</span>}
        <button type="button" onClick={clear} className="ml-auto rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Clear selection"><X className="size-4" /></button>
      </form>
    </>
  );
}

/** Delete one campaign (with its numbers and batches) after a confirm. */
export function DeleteCampaign({ id, name, action }: { id: string; name: string; action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(`Delete “${name}” with all its numbers and batches? Calls already made stay in History and Reports.`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm text-red-700 hover:bg-red-50"><Trash2 className="size-4" /> Delete</button>
    </form>
  );
}
