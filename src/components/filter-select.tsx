"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; count?: number; hint?: string };

/**
 * A filter dropdown for AutoFilterForm: shows the filter's name and current choice, opens a list with a tick on the
 * chosen one, how many match each choice, and a search box for long lists. Picking one applies the filter.
 */
export function FilterSelect({ name, label, value, options, allLabel = "Any", className }: { name: string; label: string; value?: string; options: FilterOption[]; allLabel?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [current, setCurrent] = useState(value ?? "");
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setCurrent(value ?? ""), [value]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const pick = (v: string) => {
    setCurrent(v); setOpen(false); setQ("");
    if (input.current) { input.current.value = v; input.current.form?.requestSubmit(); }
  };
  const chosen = options.find((o) => o.value === current);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div ref={box} className={cn("relative", className)}>
      <input ref={input} type="hidden" name={name} defaultValue={current} />
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        className={cn("flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm transition hover:border-navy-900/40", chosen ? "border-navy-900/50 bg-navy-900/[0.04]" : "border-line")}>
        <span className="min-w-0 flex-1 truncate"><span className="text-muted">{label}: </span><span className={chosen ? "font-medium text-ink" : "text-ink/80"}>{chosen?.label ?? allLabel}</span></span>
        {chosen ? (
          <span role="button" tabIndex={0} aria-label={`Clear ${label}`} onClick={(e) => { e.stopPropagation(); pick(""); }} onKeyDown={(e) => e.key === "Enter" && pick("")} className="rounded p-0.5 text-muted hover:bg-canvas hover:text-ink"><X className="size-3.5" /></span>
        ) : <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="anim-fade absolute left-0 z-40 mt-1.5 w-full min-w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl" role="listbox" aria-label={label}>
          {options.length > 7 && (
            <div className="relative border-b border-line p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (shown[0]) pick(shown[0].value); } }} placeholder={`Search ${label.toLowerCase()}`} className="input h-8 pl-8 text-sm" />
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto p-1">
            {!q && (
              <li><button type="button" onClick={() => pick("")} className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-canvas", !current && "font-medium")}>
                <Check className={cn("size-4 shrink-0", current ? "invisible" : "text-navy-900")} /><span className="flex-1">{allLabel}</span>
              </button></li>
            )}
            {shown.map((o) => (
              <li key={o.value}><button type="button" role="option" aria-selected={o.value === current} onClick={() => pick(o.value)} className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-canvas", o.value === current && "bg-navy-900/[0.06] font-medium")}>
                <Check className={cn("size-4 shrink-0", o.value === current ? "text-navy-900" : "invisible")} />
                <span className="min-w-0 flex-1"><span className="block truncate">{o.label}</span>{o.hint && <span className="block truncate text-xs font-normal text-muted">{o.hint}</span>}</span>
                {o.count !== undefined && <span className={cn("min-w-6 rounded-full px-1.5 text-center text-xs tabular-nums", o.count ? "bg-canvas text-ink/70" : "text-muted/60")}>{o.count}</span>}
              </button></li>
            ))}
            {!shown.length && <li className="px-3 py-4 text-center text-sm text-muted">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
