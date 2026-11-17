"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type F = { key: string; label: string; about: string };

const Toggle = ({ name, checked, onChange, big }: { name: string; checked: boolean; onChange: (v: boolean) => void; big?: boolean }) => (
  <span className="relative inline-flex shrink-0">
    <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
    <span aria-hidden className={cn("relative rounded-full bg-line transition after:absolute after:left-0.5 after:top-0.5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-navy-900/40",
      big ? "h-7 w-[3.25rem] after:size-6 peer-checked:after:translate-x-6" : "h-6 w-11 after:size-5 peer-checked:after:translate-x-5")} />
  </span>
);

/**
 * One app: a master switch that turns the whole app off for everyone, and a dropdown with each of its features.
 * Everything is one form; Save applies it.
 */
export function AppCard({ appKey, label, about, master, features, off, disabled }: { appKey: string; label: string; about: string; master: string; features: F[]; off: string[]; disabled?: boolean }) {
  const [appOn, setAppOn] = useState(!off.includes(master));
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(features.map((f) => [f.key, !off.includes(f.key)])));
  const [open, setOpen] = useState(false);
  const count = Object.values(on).filter(Boolean).length;
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-surface transition", appOn ? "border-line" : "border-red-200 bg-red-50/30")}>
      <div className="flex items-center gap-4 px-5 py-4">
        <button type="button" onClick={() => setOpen((o) => !o)} disabled={!features.length} aria-expanded={open} aria-controls={`f-${appKey}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
          {features.length > 0 && <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} />}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-base font-semibold">{label}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", appOn ? "bg-emerald-50 text-emerald-700" : "bg-red-100 text-red-700")}>{appOn ? "On" : "Off for everyone"}</span>
              {features.length > 0 && <span className="text-xs font-normal text-muted">{count} of {features.length} features on</span>}
            </span>
            <span className="block text-xs text-muted">{about}</span>
          </span>
        </button>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted">
          <span className="hidden sm:inline">Whole app</span>
          <fieldset disabled={disabled} className="contents"><Toggle name={`on:${master}`} checked={appOn} onChange={setAppOn} big /></fieldset>
        </label>
      </div>
      {/* Feature switches stay in the form even when folded away, so saving never turns them off by accident. */}
      <div id={`f-${appKey}`} className={cn("divide-y divide-line border-t border-line", !open && "hidden", !appOn && "opacity-50")}>
        {!appOn && <p className="px-5 py-2 text-xs text-red-700">The whole app is off; these settings are kept for when you switch it back on.</p>}
        {features.map((f) => (
          <label key={f.key} className="flex cursor-pointer items-center gap-4 px-5 py-3 pl-12 hover:bg-canvas/50">
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{f.label}</span>{f.about && <span className="block text-xs text-muted">{f.about}</span>}</span>
            <fieldset disabled={disabled} className="contents"><Toggle name={`on:${f.key}`} checked={!!on[f.key]} onChange={(v) => setOn((c) => ({ ...c, [f.key]: v }))} /></fieldset>
          </label>
        ))}
      </div>
    </div>
  );
}
