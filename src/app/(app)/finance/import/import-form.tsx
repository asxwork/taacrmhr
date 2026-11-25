"use client";

import { startTransition, useActionState, useRef } from "react";
import { Eye, FileSpreadsheet, Upload } from "lucide-react";
import { importWorkbook, type ImportState } from "../actions";

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString()}`;
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Choose the file, the sheets and the start day; Preview shows what would be added (nothing saved), then Import. */
export function ImportForm({ sheets, defaultFrom, lastDay, canReplace }: { sheets: { key: string; label: string; on: boolean }[]; defaultFrom: string; lastDay: string | null; canReplace: boolean }) {
  const [state, act, pending] = useActionState<ImportState, FormData>(importWorkbook, undefined);
  // Which button was pressed: added to the form data when it's sent.
  const op = useRef<"preview" | "import">("preview");
  const totals = state?.totals ? Object.entries(state.totals) : [];
  return (
    // Sent by hand (not as a form action) so the file and choices stay filled in between Preview and Import.
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("op", op.current); startTransition(() => act(fd)); }} className="space-y-5">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line p-6 text-center hover:bg-canvas/50">
        <FileSpreadsheet className="size-8 text-emerald-600" />
        <span className="text-sm font-medium">Choose the expense workbook (.xlsx)</span>
        <input type="file" name="file" accept=".xlsx" required className="text-sm" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Sheets to import</legend>
          <div className="space-y-1.5">
            {sheets.map((s) => <label key={s.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`sheet_${s.key}`} defaultChecked={s.on} className="accent-navy-900" /> {s.label}</label>)}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">Only rows from
          <input type="date" name="from" defaultValue={defaultFrom} className="input mt-1.5" />
          <span className="mt-1 block text-xs font-normal text-muted">{lastDay ? <>Your expenses in AMS go up to <b className="text-ink">{day(lastDay)}</b>, so this starts the day after. </> : null}Rows before this day are ignored even if they&apos;re in the file. Empty = every row.</span>
        </label>
      </div>
      {canReplace && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="replace" className="mt-0.5" /> <span>Replace the earlier import <span className="block text-xs text-muted">Only if the old sheet was corrected: removes the imported entries first (entries typed in by hand, or with a bill / checked / approved, stay).</span></span></label>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" onClick={() => { op.current = "preview"; }} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-50"><Eye className="size-4" /> {pending && op.current === "preview" ? "Reading…" : "Preview"}</button>
        <button type="submit" onClick={(e) => { if (!state?.preview?.length && !confirm("Import without a preview?")) { e.preventDefault(); return; } op.current = "import"; }} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50"><Upload className="size-4" /> {pending && op.current === "import" ? "Importing…" : "Import"}</button>
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.message && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${state.imported ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-900"}`}>{state.message}</p>}
      {state && !state.imported && totals.length > 0 && (
        <div className="space-y-3">
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Sheet</th><th className="px-3 py-2 font-medium">Dates</th><th className="px-3 py-2 text-right font-medium">Money in</th><th className="px-3 py-2 text-right font-medium">Spent</th><th className="px-3 py-2 text-right font-medium">Transfers</th></tr></thead>
            <tbody className="divide-y divide-line">
              {totals.map(([sheet, t]) => <tr key={sheet}><td className="px-3 py-2 font-medium">{sheet}</td><td className="whitespace-nowrap px-3 py-2 text-muted">{day(t.first)} – {day(t.last)}</td><td className="px-3 py-2 text-right tabular-nums">{t.in ? pkr(t.in) : "—"}</td><td className="px-3 py-2 text-right tabular-nums">{t.out ? pkr(t.out) : "—"}</td><td className="px-3 py-2 text-right tabular-nums">{t.transfers ? pkr(t.transfers) : "—"}</td></tr>)}
            </tbody>
          </table>
          {state.holders && state.holders.length > 0 && <p className="text-xs text-muted">New money holders that will be made: {state.holders.join(", ")}.</p>}
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-canvas text-left text-muted"><tr>{["Date", "Sheet", "Type", "Amount", "Description", "Paid to", "Category", "From"].map((h) => <th key={h} className="px-2.5 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {state.preview!.slice(0, 300).map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-2.5 py-1.5">{day(r.date)}</td><td className="px-2.5 py-1.5">{r.sheet}</td>
                    <td className="px-2.5 py-1.5">{r.kind === "in" ? "Money in" : r.kind === "transfer" ? "Transfer" : "Expense"}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">{pkr(r.amount)}</td>
                    <td className="max-w-56 truncate px-2.5 py-1.5">{r.description}</td><td className="px-2.5 py-1.5">{r.party ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-muted">{r.category ?? "—"}</td><td className="px-2.5 py-1.5 text-muted">{r.holder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.preview!.length > 300 && <p className="text-xs text-muted">Showing the first 300 of {state.preview!.length}.</p>}
        </div>
      )}
    </form>
  );
}
