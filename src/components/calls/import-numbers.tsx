"use client";

import { useActionState, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { importSheet, previewSheet, type SheetState } from "@/app/(app)/calls/actions";

const ROLES = [["phone", "Phone number"], ["phone2", "Second phone"], ["name", "Full name"], ["first", "First name"], ["last", "Last name"], ["detail", "Show to agent"], ["keep", "Keep, hide from agents"], ["skip", "Don't import"]] as const;
const pretty = (h: string) => h.replace(/\b\w/g, (c) => c.toUpperCase());

/** Upload a sheet, then say what each column is (phone, name, details shown to the agent, or skip). */
export function ImportNumbers({ campaignId }: { campaignId: string }) {
  const [preview, read, reading] = useActionState<SheetState, FormData>(previewSheet, undefined);
  const [done, save, saving] = useActionState<SheetState, FormData>(importSheet, undefined);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const id = preview?.id;
  const cur = id ? roles[id] ?? preview!.guess! : [];
  const setRole = (i: number, r: string) => {
    if (!id) return;
    const next = [...cur];
    // Phone, second phone and name each belong to one column only.
    if (r !== "detail" && r !== "skip") next.forEach((x, j) => { if (x === r) next[j] = "detail"; });
    next[i] = r;
    setRoles({ ...roles, [id]: next });
  };

  if (done?.ok) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done.message}</p>
        <button type="button" onClick={() => location.reload()} className="text-sm font-medium text-navy-900 hover:underline">Import another file</button>
      </div>
    );
  }

  if (id && preview?.headers) {
    return (
      <form action={save} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm"><b>{preview.total?.toLocaleString()}</b> rows and <b>{preview.headers.length}</b> columns found. Say what each column is:</p>
        <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-canvas text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Column</th><th className="px-3 py-2 font-medium">Is</th><th className="px-3 py-2 font-medium">Example</th></tr></thead>
            <tbody className="divide-y divide-line">
              {preview.headers.map((h, i) => (
                <tr key={h + i} className={cur[i] === "skip" ? "opacity-50" : ""}>
                  <td className="px-3 py-2 align-top">
                    {cur[i] === "detail" || cur[i] === "keep" ? <input name={`label_${i}`} defaultValue={pretty(h)} className="input h-8 w-40 text-sm" aria-label={`Label for ${h}`} title="The name the agent sees" /> : <span className="font-medium">{pretty(h)}</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select key={`${id}-${i}-${cur[i]}`} name={`col_${i}`} defaultValue={cur[i]} onChange={(e) => setRole(i, e.target.value)} className={`input h-8 w-40 py-0 text-sm ${cur[i] === "phone" ? "border-emerald-400 bg-emerald-50" : ""}`} aria-label={`What ${h} is`}>
                      {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="max-w-56 px-3 py-2 align-top text-xs text-muted"><span className="line-clamp-2">{preview.sample!.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ") || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cur.includes("phone") && <p className="text-sm text-amber-700">Choose the column with the phone number.</p>}
        {!cur.includes("name") && !cur.includes("first") && !cur.includes("last") && <p className="text-sm text-amber-700">No name column chosen: agents will see “Unknown name”. Pick Full name, or First name and Last name.</p>}
        {done?.error && <p role="alert" className="text-sm text-red-700">{done.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || !cur.includes("phone")} className="inline-flex h-9 items-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">{saving ? "Importing…" : `Import ${preview.total?.toLocaleString()} rows`}</button>
          <button type="button" onClick={() => location.reload()} className="text-sm text-muted hover:text-ink">Choose another file</button>
        </div>
        <p className="text-xs text-muted">“Show to agent” columns (project, unit, nationality, what they bought…) appear on the agent&apos;s screen for each call; “Keep, hide from agents” columns are saved but only supervisors see them (change it later under What agents see). Duplicates and do-not-call numbers are skipped.</p>
      </form>
    );
  }

  return (
    <form action={read} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-navy-900/30 hover:bg-canvas">
        <FileSpreadsheet className="size-6 text-muted" />
        <span className="text-sm font-medium">Choose an Excel (.xlsx) or CSV file</span>
        <span className="text-xs text-muted">First row = column names. Next you pick which column is the phone, the name and what the agent should see.</span>
        <input name="file" type="file" accept=".xlsx,.csv,text/csv" required className="mt-1 block w-full max-w-xs text-xs file:mr-2 file:rounded file:border-0 file:bg-navy-900 file:px-2 file:py-1 file:text-white" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {reading && <p className="text-sm text-muted">Reading the file…</p>}
      {preview?.error && <p role="alert" className="text-sm text-red-700">{preview.error}</p>}
    </form>
  );
}
