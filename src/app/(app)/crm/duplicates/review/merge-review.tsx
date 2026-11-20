"use client";

import { useMemo, useState } from "react";
import Link from "@/components/link";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, ExternalLink, GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/action-form";
import { mergeReviewed } from "../actions";

type Row = { id: string; number: number | null; createdAt: string; activities: number; deals: number; bitrix: boolean; values: Record<string, string | null> };
const FIELDS: [string, string][] = [
  ["name", "Lead name"], ["phone", "Phone"], ["phone2", "Second phone"], ["email", "E-mail"], ["project", "Project"], ["source", "Source"],
  ["stage", "Stage"], ["owner", "Responsible"], ["campaign", "Campaign"], ["interest", "Interest"], ["location", "Preferred location"],
  ["budget", "Budget"], ["sourceInfo", "Source information"],
];

/** Bitrix-style merge: one column per lead, pick the main one, pick other values field by field, see the result. */
export function MergeReview({ by, index, total, merged, skip, error, groupLabel, leads, bestId, groupCode }: {
  by: string; index: number; total: number; merged: number; skip: string[]; error?: string; groupLabel: string; leads: Row[]; bestId: string; groupCode: string;
}) {
  const [keep, setKeep] = useState(bestId);
  const [pick, setPick] = useState<Record<string, string>>({});
  const main = leads.find((l) => l.id === keep) ?? leads[0];
  // Fields shown: ones any lead has. A value differs when at least two leads have different non-empty values.
  const shown = FIELDS.filter(([k]) => leads.some((l) => l.values[k]));
  const differs = (k: string) => new Set(leads.map((l) => l.values[k]).filter(Boolean)).size > 1;
  const resultValue = (k: string) => {
    const from = leads.find((l) => l.id === (pick[k] ?? keep));
    return from?.values[k] || main?.values[k] || leads.find((l) => l.values[k])?.values[k] || null;
  };
  const q = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { ...(by === "email" && { by }), i: index, m: merged, skip: skip.join(","), ...patch };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "" && v !== 0 || k === "i") p.set(k, String(v ?? ""));
    return `/crm/duplicates/review?${p}`;
  };
  const changeKeep = (id: string) => { setKeep(id); setPick({}); };
  const picksForForm = useMemo(() => Object.entries(pick).filter(([, id]) => id !== keep), [pick, keep]);

  if (!leads.length) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <GitMerge className="mx-auto mb-3 size-10 text-emerald-600" />
        <h1 className="font-display text-2xl font-semibold">All done</h1>
        <p className="mt-1 text-sm text-muted">{merged ? `${merged} group(s) merged. ` : ""}{skip.length ? `${skip.length} left for later.` : "No duplicates left."}</p>
        <div className="mt-5 flex justify-center gap-3">
          {skip.length > 0 && <Link href={q({ skip: "", i: 0 })} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-canvas">Review the skipped ones</Link>}
          <Link href={`/crm/duplicates${by === "email" ? "?by=email" : ""}`} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white">Back to duplicates</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={mergeReviewed} className="flex min-h-[calc(100vh-8rem)] flex-col">
      <input type="hidden" name="keep" value={keep} />
      <input type="hidden" name="by" value={by} />
      <input type="hidden" name="i" value={index} />
      <input type="hidden" name="m" value={merged} />
      <input type="hidden" name="skip" value={skip.join(",")} />
      {leads.map((l) => <input key={l.id} type="hidden" name="ids" value={l.id} />)}
      {picksForForm.map(([k, id]) => <input key={k} type="hidden" name={`f_${k}`} value={id} />)}

      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Merge leads</h1>
        <span className="text-sm text-muted">{by === "phone" ? "Same phone" : "Same email"} · {groupLabel} · {leads.length} leads</span>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex-1 overflow-x-auto pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `minmax(260px,1.1fr) repeat(${leads.length}, minmax(240px,1fr))` }}>
          {/* Merge result */}
          <div className="rounded-xl border-2 border-emerald-500/60 bg-emerald-50/40">
            <div className="sticky top-0 rounded-t-xl border-b border-emerald-500/30 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800">Merge result</p>
              <p className="text-xs text-emerald-800/70">Main lead #{main?.number ?? "—"}; click a value in another column to use it instead.</p>
            </div>
            {shown.map(([k, label]) => (
              <div key={k} className="border-b border-emerald-500/15 px-4 py-2.5 last:border-0">
                <p className="text-[11px] uppercase tracking-wide text-emerald-900/60">{label}</p>
                <p className={cn("whitespace-pre-line break-words text-sm", resultValue(k) ? "text-ink" : "text-muted")}>{resultValue(k) ?? "field is empty"}</p>
              </div>
            ))}
            <div className="px-4 py-2.5 text-xs text-emerald-900/70">History, deals and notes of all {leads.length} leads go onto the result.</div>
          </div>

          {leads.map((l) => {
            const isMain = l.id === keep;
            return (
              <div key={l.id} className={cn("rounded-xl border bg-surface transition", isMain ? "border-navy-900 shadow-md" : "border-line")}>
                <label className={cn("sticky top-0 flex cursor-pointer items-center gap-2.5 rounded-t-xl border-b px-4 py-3", isMain ? "border-navy-900/20 bg-navy-900/[0.05]" : "border-line bg-canvas/60")}>
                  <input type="radio" checked={isMain} onChange={() => changeKeep(l.id)} className="size-4 accent-navy-900" aria-label={`Use lead #${l.number} as the main lead`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Created on {format(new Date(l.createdAt), "d MMM yyyy")}</span>
                    <span className="block text-xs text-muted">#{l.number ?? "—"}{l.bitrix ? " · Bitrix" : ""} · {l.activities} activities{l.deals ? ` · ${l.deals} deal(s)` : ""}{isMain ? " · main" : ""}</span>
                  </span>
                  <Link href={`/crm/leads/${l.id}`} target="_blank" className="text-muted hover:text-ink" title="Open lead" onClick={(e) => e.stopPropagation()}><ExternalLink className="size-4" /></Link>
                </label>
                {shown.map(([k, label]) => {
                  const v = l.values[k];
                  const chosen = (pick[k] ?? keep) === l.id;
                  const pickable = !!v && differs(k);
                  return (
                    <button key={k} type="button" disabled={!pickable} onClick={() => setPick((p) => ({ ...p, [k]: l.id }))}
                      className={cn("block w-full border-b border-line px-4 py-2.5 text-left last:border-0", pickable && "hover:bg-canvas", pickable && chosen && "bg-emerald-50 ring-1 ring-inset ring-emerald-500/50")}>
                      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">{label}{pickable && chosen && <span className="rounded bg-emerald-600 px-1 text-[9px] font-semibold text-white">USED</span>}</span>
                      <span className={cn("block whitespace-pre-line break-words text-sm", v ? "text-ink" : "text-muted")}>{v ?? "field is empty"}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-3 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Merged: <b className="text-ink">{merged}</b></span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Left: <b className="text-ink">{total}</b></span>
        <div className="mx-auto flex gap-2">
          <SubmitButton pendingText="Merging…"><GitMerge className="size-4" /> Merge</SubmitButton>
          {/* The skipped group drops out of the list, so the same position shows the next one. */}
          <Link href={q({ i: index, skip: [...skip, groupCode].join(",") })} className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-canvas">Later</Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/crm/duplicates${by === "email" ? "?by=email" : ""}`} className="text-xs font-medium uppercase tracking-wide text-muted hover:text-ink">Back to list</Link>
          <Link href={q({ i: Math.max(0, index - 1) })} aria-label="Previous group" className={cn("rounded-full border border-line p-1.5 hover:bg-canvas", index === 0 && "pointer-events-none opacity-40")}><ChevronLeft className="size-4" /></Link>
          <span className="text-xs tabular-nums text-muted">{index + 1} / {total}</span>
          <Link href={q({ i: Math.min(total - 1, index + 1) })} aria-label="Next group" className={cn("rounded-full border border-line p-1.5 hover:bg-canvas", index >= total - 1 && "pointer-events-none opacity-40")}><ChevronRight className="size-4" /></Link>
        </div>
      </div>
    </form>
  );
}

