"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = { type: string; value: string };

// Pakistan first, then the Gulf (most overseas clients), then the rest.
const COUNTRIES = [
  ["PK", "+92"], ["AE", "+971"], ["SA", "+966"], ["QA", "+974"], ["OM", "+968"], ["KW", "+965"], ["BH", "+973"],
  ["GB", "+44"], ["US", "+1"], ["CA", "+1"], ["AU", "+61"], ["DE", "+49"], ["TR", "+90"], ["CN", "+86"], ["MY", "+60"],
] as const;
const PHONE_TYPES = ["Mobile", "Work", "Home", "WhatsApp", "Other"];
const EMAIL_TYPES = ["Work", "Personal", "Other"];

/** "+92 300 1234567" / "0300-1234567" → { code: "+92", number: "300 1234567" }. */
function splitPhone(v: string) {
  const s = v.trim();
  if (/^0\d/.test(s)) return { code: "+92", number: s.slice(1) };
  const hit = [...COUNTRIES].sort((a, b) => b[1].length - a[1].length).find(([, c]) => s.startsWith(c));
  return hit ? { code: hit[1], number: s.slice(hit[1].length).trim() } : { code: "+92", number: s.replace(/^\+/, "") };
}

/** Bitrix-style list of phone numbers: country code, number, type, remove; "Add" for another. Posts JSON in `name`. */
export function PhoneList({ name, initial }: { name: string; initial: Entry[] }) {
  const [rows, setRows] = useState(() => (initial.length ? initial : [{ type: "Mobile", value: "" }]).map((e) => ({ type: e.type, ...splitPhone(e.value) })));
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const value = JSON.stringify(rows.filter((r) => r.number.trim()).map((r) => ({ type: r.type, value: `${r.code} ${r.number.trim()}` })));
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <div className="flex min-w-0 flex-1 rounded-lg border border-line bg-surface shadow-xs focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-navy-700/10">
            <select value={r.code} onChange={(e) => update(i, { code: e.target.value })} aria-label="Country code"
              className="w-[5.5rem] shrink-0 rounded-l-lg border-r border-line bg-canvas/60 px-2 text-sm outline-none">
              {COUNTRIES.map(([iso, code]) => <option key={iso} value={code}>{iso} {code}</option>)}
            </select>
            <input value={r.number} onChange={(e) => update(i, { number: e.target.value })} inputMode="tel" placeholder="300 1234567" aria-label="Phone number"
              className="palette-input h-10 min-w-0 flex-1 bg-transparent px-3 text-base outline-none sm:text-sm" />
          </div>
          <select value={r.type} onChange={(e) => update(i, { type: e.target.value })} className="input w-28 shrink-0" aria-label="Phone type">
            {PHONE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <RemoveButton show={rows.length > 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => setRows((x) => [...x, { type: "Mobile", code: "+92", number: "" }])} />
    </div>
  );
}

export function EmailList({ name, initial }: { name: string; initial: Entry[] }) {
  const [rows, setRows] = useState<Entry[]>(initial.length ? initial : [{ type: "Work", value: "" }]);
  const update = (i: number, patch: Partial<Entry>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const value = JSON.stringify(rows.filter((r) => r.value.trim()).map((r) => ({ type: r.type, value: r.value.trim().toLowerCase() })));
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input type="email" value={r.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="name@example.com" aria-label="Email" className="input min-w-0 flex-1" />
          <select value={r.type} onChange={(e) => update(i, { type: e.target.value })} className="input w-28 shrink-0" aria-label="Email type">
            {EMAIL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <RemoveButton show={rows.length > 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => setRows((x) => [...x, { type: "Work", value: "" }])} />
    </div>
  );
}

function RemoveButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  return show
    ? <button type="button" onClick={onClick} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600" aria-label="Remove"><X className="size-4" /></button>
    : <span className="size-10 shrink-0" aria-hidden />;
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm text-navy-900 underline decoration-dotted underline-offset-4 hover:decoration-solid">
      <Plus className="size-3.5" /> Add
    </button>
  );
}

export type UnitOption = { id: string; label: string; sub: string };

/** Searchable picker for the unit/listing a lead is about. Posts the unit id in `name`. */
export function UnitPicker({ name, options, initial }: { name: string; options: UnitOption[]; initial?: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (n ? options.filter((o) => `${o.label} ${o.sub}`.toLowerCase().includes(n)) : options).slice(0, 60);
  }, [q, options]);

  return (
    <div ref={box} className="relative" onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && setOpen(false)}>
      <input type="hidden" name={name} value={value} />
      <button type="button" onClick={() => setOpen((o) => !o)} className="input flex items-center gap-2 text-left">
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted/70")}>{selected ? selected.label : "Choose a unit or listing…"}</span>
        {selected && <span role="button" tabIndex={0} aria-label="Clear" onClick={(e) => { e.stopPropagation(); setValue(""); }} onKeyDown={(e) => e.key === "Enter" && setValue("")} className="rounded p-0.5 text-muted hover:text-ink"><X className="size-3.5" /></span>}
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="anim-fade absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-line bg-surface p-1 shadow-xl">
          <label className="relative mb-1 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, unit no, address…" className="input h-8 pl-8" />
          </label>
          <div className="max-h-64 overflow-y-auto">
            {shown.map((o) => (
              <button key={o.id} type="button" onClick={() => { setValue(o.id); setOpen(false); setQ(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-canvas">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{o.label}</span>
                  <span className="block truncate text-xs text-muted">{o.sub}</span>
                </span>
                {o.id === value && <Check className="size-4 shrink-0 text-navy-900" />}
              </button>
            ))}
            {shown.length === 0 && <p className="px-2 py-3 text-sm text-muted">No units match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
