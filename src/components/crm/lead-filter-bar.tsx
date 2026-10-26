"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Pin, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { ACTIVITY_FILTERS, DATE_FILTERS, LEAD_FILTER_KEYS, STATUS_GROUPS, filterQuery, type LeadFilters } from "@/lib/lead-filters-shared";
import { deleteLeadFilter, saveLeadFilter } from "@/app/(app)/crm/leads/filter-actions";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
export type FilterPreset = { id?: string; name: string; query: string };

const parse = (q: string): LeadFilters => Object.fromEntries(new URLSearchParams(q)) as LeadFilters;

/** Bitrix-style filter: search box with the active preset as a chip; the panel holds presets (left) and fields (right). Everything applies as you change it. */
export function LeadFilterBar({ filters, view, presets, options }: {
  filters: LeadFilters;
  view?: string;
  presets: FilterPreset[];
  options: { stages: Opt[]; sources: Opt[]; projects: Opt[]; owners: Opt[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeadFilters>(filters);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [shift, setShift] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the URL when it changes from outside (back button, preset links).
  const urlKey = JSON.stringify(filters);
  useEffect(() => setDraft(JSON.parse(urlKey) as LeadFilters), [urlKey]);

  // Keep the panel on screen: slide it left when the search box sits near the right edge.
  useEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const width = Math.min(832, window.innerWidth - 32);
    setShift(Math.max(16 - r.left, Math.min(0, window.innerWidth - 16 - r.left - width)));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function go(next: LeadFilters) {
    const p = new URLSearchParams();
    for (const k of LEAD_FILTER_KEYS) if (next[k]) p.set(k, next[k]!);
    if (view) p.set("view", view);
    startTransition(() => router.replace(`/crm/leads${p.size ? `?${p}` : ""}`, { scroll: false }));
  }

  /** Update one or more fields; text fields wait for a pause in typing. */
  function set(patch: LeadFilters, delay = 0) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(next), delay);
  }

  const current = filterQuery(draft);
  const active = presets.find((p) => filterQuery(parse(p.query)) === current);
  const chip = active?.name ?? (current ? "Custom filter" : "Leads in progress");

  async function save() {
    if (!saveName.trim()) return;
    setSaving(true);
    await saveLeadFilter(saveName, current);
    setSaving(false);
    setSaveName("");
    router.refresh();
  }

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <div className={cn("flex h-10 items-center gap-2 rounded-lg border bg-surface pl-2 pr-1.5 shadow-xs transition-colors", open ? "border-navy-700 ring-2 ring-navy-700/10" : "border-line")}>
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex shrink-0 items-center gap-1.5 rounded-md bg-navy-900/[0.07] py-1 pl-2.5 pr-1.5 text-sm font-medium text-navy-900 hover:bg-navy-900/10" aria-expanded={open} aria-label="Filters">
          <span className="max-w-40 truncate">{chip}</span>
          {current ? (
            <span role="button" tabIndex={0} aria-label="Clear filter" onClick={(e) => { e.stopPropagation(); setDraft({ q: draft.q }); go({ q: draft.q }); }} onKeyDown={(e) => e.key === "Enter" && go({ q: draft.q })} className="rounded p-0.5 hover:bg-navy-900/10">
              <X className="size-3.5" />
            </span>
          ) : <ChevronDown className="size-3.5" />}
        </button>
        <input
          value={draft.q ?? ""}
          onChange={(e) => set({ q: e.target.value }, 400)}
          onFocus={() => setOpen(false)}
          placeholder="Search name, phone, ID, location…"
          aria-label="Search leads"
          className="palette-input h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/80"
        />
        {pending ? <Loader2 className="size-4 shrink-0 animate-spin text-muted" /> : <Search className="size-4 shrink-0 text-muted" />}
        {(draft.q || current) && (
          <button type="button" onClick={() => { setDraft({}); go({}); }} className="rounded-md p-1 text-muted hover:bg-canvas hover:text-ink" aria-label="Reset search and filters"><X className="size-4" /></button>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink sm:hidden" aria-label="Open filters"><SlidersHorizontal className="size-4" /></button>
      </div>

      {open && (
        <div style={{ left: shift }} className="palette-in absolute top-12 z-40 flex max-h-[75vh] w-[min(52rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl sm:flex-row">
          {/* Presets */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-56 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
            {presets.map((p) => {
              const on = p === active || (!active && !current && !p.query);
              return (
                <div key={p.id ?? p.name} className="group flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => { const f = { ...parse(p.query), q: draft.q }; setDraft(f); go(f); setOpen(false); }}
                    className={cn("flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors", on ? "bg-navy-900/[0.07] font-medium text-navy-900" : "text-ink/80 hover:bg-canvas")}
                  >
                    {p.name}
                  </button>
                  {p.id && (
                    <button type="button" onClick={async () => { await deleteLeadFilter(p.id!); router.refresh(); }} className="rounded p-1 text-muted opacity-0 transition hover:text-red-600 group-hover:opacity-100" aria-label={`Delete filter ${p.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Fields */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <F label="Lead name"><input value={draft.name ?? ""} onChange={(e) => set({ name: e.target.value }, 400)} className="input" /></F>
              <F label="Phone"><input value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value }, 400)} className="input" inputMode="tel" /></F>
              <F label="Status" wide>
                <div className="flex rounded-lg bg-black/5 p-0.5">
                  {STATUS_GROUPS.map((g) => (
                    <button key={g.value} type="button" onClick={() => set({ group: g.value, stage: "" })} className={cn("flex-1 rounded-md px-2 py-1.5 text-sm", (draft.group ?? "") === g.value && !draft.stage ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{g.label}</button>
                  ))}
                </div>
              </F>
              <F label="Stage"><Multi options={options.stages} value={draft.stage} onChange={(v) => set({ stage: v })} /></F>
              <F label="Source"><Multi options={options.sources} value={draft.source} onChange={(v) => set({ source: v })} /></F>
              <F label="Project"><Multi options={options.projects} value={draft.project} onChange={(v) => set({ project: v })} /></F>
              {options.owners.length > 1 && <F label="Responsible person"><Multi options={[{ id: "me", name: "Me" }, ...options.owners]} value={draft.owner} onChange={(v) => set({ owner: v })} /></F>}
              <F label="Activities">
                <select value={draft.activity ?? ""} onChange={(e) => set({ activity: e.target.value })} className="input">{ACTIVITY_FILTERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
              </F>
              <F label="Not contacted for">
                <select value={draft.stale ?? ""} onChange={(e) => set({ stale: e.target.value })} className="input">
                  <option value="">Any</option>
                  {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d}+ days</option>)}
                </select>
              </F>
              <DateField label="Created on" preset={draft.created} from={draft.cfrom} to={draft.cto} onChange={(created, cfrom, cto) => set({ created, cfrom, cto })} />
              <DateField label="Modified on" preset={draft.modified} from={draft.mfrom} to={draft.mto} onChange={(modified, mfrom, mto) => set({ modified, mfrom, mto })} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Name this filter to save it" className="input h-9 min-w-0 flex-1" aria-label="Filter name" />
              <button type="button" onClick={save} disabled={!saveName.trim() || saving || !current} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white disabled:opacity-40">
                <Pin className="size-3.5" /> {saving ? "Saving…" : "Save filter"}
              </button>
              <button type="button" onClick={() => { setDraft({ q: draft.q }); go({ q: draft.q }); }} className="h-9 rounded-lg px-3 text-sm text-muted hover:bg-canvas hover:text-ink">Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    // A div, not a label: a label would "click" the first button inside (e.g. the status switch).
    <div className={cn("block", wide && "sm:col-span-2")} role="group" aria-label={label}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

function DateField({ label, preset, from, to, onChange }: { label: string; preset?: string; from?: string; to?: string; onChange: (preset: string, from: string, to: string) => void }) {
  return (
    <F label={label}>
      <select value={preset ?? ""} onChange={(e) => onChange(e.target.value, "", "")} className="input">{DATE_FILTERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
      {preset === "custom" && (
        <span className="mt-1.5 grid grid-cols-2 gap-1.5">
          <input type="date" value={from ?? ""} onChange={(e) => onChange("custom", e.target.value, to ?? "")} className="input" aria-label={`${label} from`} />
          <input type="date" value={to ?? ""} onChange={(e) => onChange("custom", from ?? "", e.target.value)} className="input" aria-label={`${label} to`} />
        </span>
      )}
    </F>
  );
}

/** Multi-select shown as chips, with a checklist dropdown. Value is comma-separated ids. */
function Multi({ options, value, onChange }: { options: Opt[]; value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => (value ? value.split(",") : []), [value]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const toggle = (id: string) => onChange((selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]).join(","));
  const shown = options.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div role="button" tabIndex={0} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((o) => !o)}
        className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-left text-sm shadow-xs">
        {selected.length === 0 && <span className="px-1 text-muted/70">Any</span>}
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-md bg-navy-900/[0.07] py-0.5 pl-2 pr-1 text-xs font-medium text-navy-900">
            {options.find((o) => o.id === id)?.name ?? "—"}
            <span role="button" tabIndex={0} aria-label="Remove" onClick={(e) => { e.stopPropagation(); toggle(id); }} onKeyDown={(e) => e.key === "Enter" && toggle(id)} className="rounded p-0.5 hover:bg-navy-900/10"><X className="size-3" /></span>
          </span>
        ))}
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted" />
      </div>
      {open && (
        <div className="anim-fade absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-xl">
          {options.length > 8 && <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" className="input mb-1 h-8" />}
          {shown.map((o) => (
            <button key={o.id} type="button" onClick={() => toggle(o.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-canvas">
              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", selected.includes(o.id) ? "border-navy-900 bg-navy-900 text-white" : "border-line")}>{selected.includes(o.id) && <Check className="size-3" />}</span>
              <span className="truncate">{o.name}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="px-2 py-2 text-sm text-muted">No options</p>}
        </div>
      )}
    </div>
  );
}
