"use client";

import { useMemo, useState } from "react";
import { GripVertical, RotateCcw, Search, X } from "lucide-react";
import { DrawerPortal } from "@/components/drawer-portal";
import { LEAD_COLUMNS } from "@/lib/lead-columns";
import { cn } from "@/lib/utils";

/**
 * "List view settings" for the leads table: tick the columns to show (Lead is always shown), drag the chosen ones into
 * order, and apply for yourself or (Super Admin) for everyone. Default puts back the company / standard set.
 */
export function ColumnSettings({ value, isSuperAdmin, onApply, onClose }: { value: string[]; isSuperAdmin: boolean; onApply: (cols: string[], scope: "me" | "everyone" | "reset") => Promise<void>; onClose: () => void }) {
  const [cols, setCols] = useState(value);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"me" | "everyone">("me");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const label = (k: string) => LEAD_COLUMNS.find((c) => c.key === k)?.label ?? k;
  const shown = useMemo(() => LEAD_COLUMNS.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase())), [q]);
  const toggle = (k: string) => k !== "lead" && setCols((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const move = (from: number, to: number) => setCols((cur) => { const a = [...cur]; const [x] = a.splice(from, 1); a.splice(to, 0, x!); return a; });
  const apply = async (s: "me" | "everyone" | "reset") => { setBusy(true); await onApply(cols, s); setBusy(false); onClose(); };

  return (
    <DrawerPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Choose columns">
        <div className="anim-fade absolute inset-0 bg-navy-950/40" onClick={onClose} />
        <div className="anim-pop relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:max-w-4xl sm:rounded-2xl">
          <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <h2 className="flex-1 font-semibold">List view settings · Leads</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label="Close"><X className="size-4" /></button>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_16rem] md:overflow-hidden">
            <div className="min-h-0 p-5 md:overflow-y-auto">
              <div className="relative mb-4"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find field" className="input pl-9" autoFocus /></div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((c) => (
                  <label key={c.key} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors", cols.includes(c.key) ? "bg-navy-900/[0.06] font-medium" : "hover:bg-canvas", c.key === "lead" && "cursor-default")}>
                    <input type="checkbox" checked={cols.includes(c.key)} disabled={c.key === "lead"} onChange={() => toggle(c.key)} className="size-4 accent-navy-900" />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="min-h-0 border-t border-line bg-canvas/50 p-4 md:overflow-y-auto md:border-l md:border-t-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Order (drag)</p>
              <ol className="space-y-1">
                {cols.map((k, i) => (
                  <li key={k} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }} onDragEnd={() => setDrag(null)}
                    className={cn("flex cursor-grab items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm active:cursor-grabbing", drag === i && "opacity-60 ring-2 ring-gold-400")}>
                    <GripVertical className="size-4 text-muted" />
                    <span className="flex-1">{label(k)}</span>
                    <span className="flex gap-0.5 sm:hidden">
                      <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} className="rounded px-1.5 text-muted disabled:opacity-30" aria-label="Move up">↑</button>
                      <button type="button" disabled={i === cols.length - 1} onClick={() => move(i, i + 1)} className="rounded px-1.5 text-muted disabled:opacity-30" aria-label="Move down">↓</button>
                    </span>
                    {k !== "lead" && <button type="button" onClick={() => toggle(k)} className="text-muted hover:text-red-600" aria-label={`Remove ${label(k)}`}><X className="size-3.5" /></button>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
            {isSuperAdmin && (
              <label className="flex items-center gap-2 text-sm text-muted">Apply to
                <select value={scope} onChange={(e) => setScope(e.target.value as "me" | "everyone")} className="input h-9 w-36"><option value="me">me</option><option value="everyone">everyone</option></select>
              </label>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={() => apply("reset")} disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-muted hover:bg-canvas"><RotateCcw className="size-4" /> Default</button>
              <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm hover:bg-canvas">Cancel</button>
              <button type="button" onClick={() => apply(scope)} disabled={busy} className="inline-flex h-10 items-center rounded-lg bg-navy-900 px-5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60">{busy ? "Saving…" : "Apply"}</button>
            </div>
          </footer>
        </div>
      </div>
    </DrawerPortal>
  );
}
