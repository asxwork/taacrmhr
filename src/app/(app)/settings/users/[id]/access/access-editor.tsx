"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccessRow = { key: string; label: string; group: string; actions: { key: string; label: string; base: string; value: string; options: { value: string; label: string }[] }[] };

/**
 * One tab per app, one card per feature with only the actions it really has. Every select stays in the form (hidden
 * tabs too), so Save sends the whole picture. "" = follow their roles.
 */
export function AccessEditor({ rows, groups, disabled }: { rows: AccessRow[]; groups: string[]; disabled: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.flatMap((r) => r.actions.map((a) => [`${r.key}:${a.key}`, a.value]))));
  const [tab, setTab] = useState(groups[0] ?? "");
  const [q, setQ] = useState("");
  const count = (g: string) => rows.filter((r) => r.group === g).reduce((n, r) => n + r.actions.filter((a) => vals[`${r.key}:${a.key}`]).length, 0);
  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => new Set(rows.filter((r) => (needle ? r.label.toLowerCase().includes(needle) || r.group.toLowerCase().includes(needle) : r.group === tab)).map((r) => r.key)), [rows, needle, tab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
          {groups.map((g) => {
            const n = count(g);
            return (
              <button key={g} type="button" onClick={() => { setTab(g); setQ(""); }} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition", !needle && tab === g ? "bg-navy-900 text-white" : "text-muted hover:bg-canvas hover:text-ink")}>
                {g}{n > 0 && <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", !needle && tab === g ? "bg-white/20" : "bg-amber-100 text-amber-800")}>{n}</span>}
              </button>
            );
          })}
        </div>
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a feature…" className="input h-9 pl-9 text-sm" aria-label="Find a feature" />
        </label>
      </div>

      {rows.map((r) => {
        const changed = r.actions.filter((a) => vals[`${r.key}:${a.key}`]).length;
        return (
          <div key={r.key} className={cn("rounded-xl border bg-surface p-4", changed ? "border-amber-300" : "border-line", !visible.has(r.key) && "hidden")}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="font-medium">{r.label}</p>
              {needle && <span className="text-xs text-muted">· {r.group}</span>}
              {changed > 0 && (
                <>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{changed} exception{changed === 1 ? "" : "s"}</span>
                  {!disabled && <button type="button" onClick={() => setVals((v) => ({ ...v, ...Object.fromEntries(r.actions.map((a) => [`${r.key}:${a.key}`, ""])) }))} className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><RotateCcw className="size-3.5" /> Back to role</button>}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {r.actions.map((a) => {
                const k = `${r.key}:${a.key}`, v = vals[k] ?? "";
                return (
                  <label key={a.key} className={cn("block rounded-lg border px-2.5 py-2", v ? "border-amber-300 bg-amber-50" : "border-line bg-canvas/40")}>
                    <span className="flex items-center justify-between gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{a.label}{v ? <span className="normal-case tracking-normal text-amber-700">changed</span> : <span className="font-normal normal-case tracking-normal opacity-70">role</span>}</span>
                    <select name={`o:${k}`} value={v} disabled={disabled} onChange={(e) => setVals((x) => ({ ...x, [k]: e.target.value }))}
                      className={cn("mt-1 w-full cursor-pointer bg-transparent text-sm font-medium outline-none", v ? "text-amber-900" : "text-ink")}>
                      <option value="">{a.base}</option>
                      {a.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      {needle && visible.size === 0 && <p className="py-8 text-center text-sm text-muted">No feature matches “{q}”.</p>}
    </div>
  );
}
