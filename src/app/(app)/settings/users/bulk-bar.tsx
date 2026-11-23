"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { PASSWORD_TOKENS, passwordFromFormat } from "@/lib/password-format";
import { bulkUsers } from "./actions";

type Opt = { id: string; name: string };
const OPS = [
  ["addRole", "Add role"], ["removeRole", "Remove role"], ["setRole", "Set role (replace their roles)"],
  ["branch", "Set branch"], ["manager", "Set “Reports to”"],
  ["activate", "Activate"], ["deactivate", "Deactivate (signs them out)"], ["loginEmail", "Send login email"],
] as const;
const SUPER_OPS = [["passwordFormat", "Set passwords from a format (Super Admin)"], ["delete", "Delete users (Super Admin)"]] as const;

const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[form="bulk-users"][name="ids"]')];

/** "Select all" box for the table header. */
export function SelectAllUsers() {
  return <input type="checkbox" aria-label="Select all users" className="accent-navy-900" onChange={(e) => { for (const b of boxes()) b.checked = e.target.checked; document.dispatchEvent(new Event("bulk-users-change")); }} />;
}

/** Tick box on each row (outside the form, joined to it with form="bulk-users"). */
export function UserTick({ id, name }: { id: string; name: string }) {
  return <input type="checkbox" name="ids" value={id} form="bulk-users" aria-label={`Select ${name}`} className="accent-navy-900" onChange={() => document.dispatchEvent(new Event("bulk-users-change"))} />;
}

/** Bottom bar once users are ticked: pick an action (and its value), Apply. */
export function UsersBulkBar({ roles, branches, managers, people = [], isSuperAdmin = false }: { roles: Opt[]; branches: Opt[]; managers: Opt[]; people?: Opt[]; isSuperAdmin?: boolean }) {
  const [count, setCount] = useState(0);
  const [op, setOp] = useState("");
  const [pattern, setPattern] = useState("{First}@{phone4}");
  const [state, act, pending] = useActionState(bulkUsers, undefined);
  useEffect(() => {
    const update = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("bulk-users-change", update);
    return () => document.removeEventListener("bulk-users-change", update);
  }, []);
  // After a change: clear the ticks.
  useEffect(() => {
    if (!state?.ok) return;
    for (const b of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][aria-label^="Select"]')) b.checked = false;
    setCount(0); setOp("");
  }, [state]);
  const clear = () => { for (const b of boxes()) b.checked = false; document.querySelectorAll<HTMLInputElement>('input[aria-label="Select all users"]').forEach((b) => (b.checked = false)); setCount(0); };
  const values = op === "addRole" || op === "removeRole" || op === "setRole" ? roles : op === "branch" ? branches : op === "manager" ? managers : null;
  const danger = op === "deactivate" || op === "setRole" || op === "delete" || op === "passwordFormat";
  return (
    <>
      {state?.message && !count && <p role="status" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg">{state.message}</p>}
      <form id="bulk-users" action={act} onSubmit={(e) => { if (danger && !confirm(op === "delete" ? `Delete ${count} user(s) for good? This can't be undone. (People who left are usually better deactivated: their leads stay with them.)` : op === "passwordFormat" ? `Change the password of ${count} user(s) to the format ${pattern}? Their old passwords stop working.` : `${op === "deactivate" ? "Deactivate" : "Replace the roles of"} ${count} user(s)?`)) e.preventDefault(); }}
        className={count ? "sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-xl" : "hidden"}>
        <span className="mr-1 text-sm font-medium tabular-nums">{count} selected</span>
        <select name="op" value={op} onChange={(e) => setOp(e.target.value)} required className="input h-9 w-auto min-w-56 pr-8" aria-label="Bulk action">
          <option value="">Choose action…</option>
          {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {isSuperAdmin && SUPER_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {op === "delete" && (
          <>
            <input type="hidden" name="confirm" value="DELETE" />
            <select name="transferTo" className="input h-9 w-60" aria-label="Give their leads and deals to">
              <option value="">Their leads & deals: leave unassigned</option>
              {people.map((v) => <option key={v.id} value={v.id}>Give their leads to {v.name}</option>)}
            </select>
          </>
        )}
        {op === "passwordFormat" && (
          <div className="order-last w-full space-y-2 rounded-lg bg-canvas p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input name="pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} required className="input h-9 w-64 font-mono" aria-label="Password format" />
              <span className="text-muted">e.g. Huzaifa Khan, phone …4567 → <b className="font-mono text-ink">{passwordFromFormat(pattern, { name: "Huzaifa Khan", email: "huzaifa@theadvisorassociates.com", phone: "0300 1234567", code: "TAA-012" }) || "—"}</b></span>
              <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" name="force" defaultChecked className="accent-navy-900" /> Ask them to choose their own at the next sign-in</label>
            </div>
            <div className="flex flex-wrap gap-1.5">{PASSWORD_TOKENS.map(([t, d]) => <button key={t} type="button" title={d} onClick={() => setPattern((p) => p + t)} className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-xs hover:border-navy-900/40">{t}</button>)}</div>
            <p className="text-xs text-muted">Click a part to add it. Results shorter than 8 characters are skipped. Your own password isn&apos;t changed. Tell people their password yourself: nothing is emailed.</p>
          </div>
        )}
        {values && (
          <select name="value" required={op !== "branch" && op !== "manager"} className="input h-9 w-56" aria-label="Value" key={op}>
            <option value="">{op === "branch" ? "— No branch —" : op === "manager" ? "— Nobody —" : "Choose role…"}</option>
            {values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
        <button type="submit" disabled={!op || pending} className={`h-9 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-navy-900 hover:bg-navy-800"}`}>{pending ? "Applying…" : "Apply"}</button>
        {state?.error && <span role="alert" className="text-sm text-red-600">{state.error}</span>}
        <button type="button" onClick={clear} className="ml-auto rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Clear selection"><X className="size-4" /></button>
      </form>
    </>
  );
}
