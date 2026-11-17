"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { membersToHead, setDepartmentHead } from "./actions";

/** Head-of-department picker that saves on change. */
export function HeadSelect({ departmentId, value, options, disabled }: { departmentId: string; value: string; options: { id: string; name: string; inDept: boolean }[]; disabled?: boolean }) {
  const [cur, setCur] = useState(value);
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);
  const inDept = options.filter((o) => o.inDept), others = options.filter((o) => !o.inDept);
  return (
    <span className="flex items-center gap-2">
      <select value={cur} disabled={disabled || pending} aria-label="Head of department"
        onChange={(e) => { const v = e.target.value; setCur(v); start(async () => { await setDepartmentHead(departmentId, v || null); setOk(true); setTimeout(() => setOk(false), 1500); }); }}
        className={cn("input h-9 w-full min-w-56 font-medium", !cur && "text-amber-700", ok && "ring-2 ring-emerald-400")}>
        <option value="">No head set</option>
        {inDept.length > 0 && <optgroup label="In this department">{inDept.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>}
        {others.length > 0 && <optgroup label="Others">{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>}
      </select>
      <span className="w-4 shrink-0">{pending ? <Loader2 className="size-4 animate-spin text-muted" /> : ok ? <Check className="size-4 text-emerald-600" /> : null}</span>
    </span>
  );
}

/** "Everyone → head" / "Only unassigned → head" for one department. */
export function ToHeadButtons({ departmentId, hasHead, offCount, unassigned }: { departmentId: string; hasHead: boolean; offCount: number; unassigned: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (only: boolean) => start(async () => {
    const r = await membersToHead(departmentId, only);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message ?? "Done." });
    if (!r.error) setTimeout(() => location.reload(), 900);
  });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!hasHead || pending || !offCount} onClick={() => run(false)} title={hasHead ? "" : "Choose the head first"}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-40">
        {pending && <Loader2 className="size-4 animate-spin" />} Everyone → head{offCount ? ` (${offCount})` : ""}
      </button>
      {unassigned > 0 && unassigned !== offCount && (
        <button type="button" disabled={!hasHead || pending} onClick={() => run(true)} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm hover:bg-canvas disabled:opacity-40">Only unassigned ({unassigned})</button>
      )}
      {msg && <span role="status" className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</span>}
    </span>
  );
}
