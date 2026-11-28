"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { checkCallNumbers, importCallRows, keepCallFile } from "@/app/(app)/calls/actions";
import { phoneKey } from "@/lib/crm-shared";
import { CALL_COLUMN_ROLES as ROLES, buildCallRows, guessCallColumns } from "@/lib/sheet-guess";

const pretty = (h: string) => h.replace(/\b\w/g, (c) => c.toUpperCase());
const PART = 1000;
/** A phone key that can't be a real number: too short / long, or one digit repeated (0000000000). */
const looksWrong = (k: string) => k.length < 10 || k.length > 15 || /^(\d)\1+$/.test(k) || /^0?3\d{9}$/.test(k) === false && k.startsWith("03");
type Check = { noPhone: number; invalid: Set<string>; fileDup: number; inCampaign: Set<string>; dnc: Set<string>; otherCalled: Set<string>; leads: Set<string> };
type Sheet = { id: string; headers: string[]; rows: Record<string, string>[]; total: number; sample: string[][]; guess: string[] };

/**
 * Upload a sheet, then say what each column is (phone, name, details shown to the agent, or skip). The file is read
 * here in the browser; only the chosen rows go to the server, 1,000 at a time.
 */
export function ImportNumbers({ campaignId, check: doCheck = true }: { campaignId: string; check?: boolean }) {
  const [preview, setPreview] = useState<(Sheet & { error?: undefined }) | { error: string; id?: undefined; headers?: undefined } | undefined>();
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState<{ ok?: boolean; message?: string; error?: string } | undefined>();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  // Bad-number check, run before the import: what's wrong, and what to skip.
  const [check, setCheck] = useState<Check | undefined>();
  const [skipOther, setSkipOther] = useState(true);
  const [skipWrong, setSkipWrong] = useState(true);
  const [skipLeads, setSkipLeads] = useState(false);
  const id = preview?.id;
  const cur = id ? roles[id] ?? (preview as Sheet).guess : [];
  const setRole = (i: number, r: string) => {
    if (!id) return;
    const next = [...cur];
    // Phone, second phone, name, first and last name each belong to one column only; Show / Keep hidden / Don't
    // import can be chosen for as many columns as you like.
    if (["phone", "phone2", "name", "first", "last"].includes(r)) next.forEach((x, j) => { if (x === r) next[j] = "detail"; });
    next[i] = r;
    setRoles({ ...roles, [id]: next });
    setCheck(undefined);
  };
  const read = async (file: File | undefined) => {
    if (!file?.size) return;
    if (file.size > 20_000_000) { setPreview({ error: "The file is larger than 20 MB. Split it into smaller files." }); return; }
    setReading(true); setPreview(undefined);
    try {
      const { readSheetFile } = await import("@/lib/sheet-read");
      const sheet = await readSheetFile(file);
      const headers = sheet.headers.filter(Boolean);
      if (!headers.length || !sheet.rows.length) { setPreview({ error: "The file has no rows (the first row should be the column names)." }); return; }
      const rows = sheet.rows.slice(0, 50_000);
      setPreview({ id: String(Date.now()), headers, rows, total: rows.length, sample: rows.slice(0, 4).map((r) => headers.map((h) => r[h] ?? "")), guess: guessCallColumns(headers, rows) });
      // The exact file is kept on the server for Super Admins (Campaign → Imported files), in the background.
      const fd = new FormData(); fd.set("campaignId", campaignId); fd.set("file", file);
      void keepCallFile(fd).catch(() => {});
    } catch {
      setPreview({ error: "Couldn't read that file. Save it as .xlsx or .csv and try again." });
    } finally { setReading(false); }
  };
  const save = async (form: HTMLFormElement) => {
    if (!preview?.headers || saving) return;
    const p = preview as Sheet;
    const fd = new FormData(form);
    const role = p.headers.map((_, i) => String(fd.get(`col_${i}`) ?? "") || "skip");
    const label = p.headers.map((h, i) => (String(fd.get(`label_${i}`) ?? "") || pretty(h)).slice(0, 60));
    if (!role.includes("phone")) { setDone({ error: "Choose which column has the phone number." }); return; }
    const built = buildCallRows(p.headers, p.rows, role, label);
    if (!built.length) { setDone({ error: "No phone numbers found in that column (a phone needs at least 7 digits). Check which column you chose as Phone number." }); return; }
    const keyOf = (r: { phone: string }) => phoneKey(r.phone) ?? "";
    if (!check && doCheck) {
      // Step 1: check the numbers first and show what's wrong before anything is imported.
      setSaving(true); setDone(undefined); setProgress("checking…");
      try {
        const keys = [...new Set(built.map(keyOf))];
        const c: Check = { noPhone: p.rows.length - built.length, invalid: new Set(keys.filter(looksWrong)), fileDup: built.length - keys.length, inCampaign: new Set(), dnc: new Set(), otherCalled: new Set(), leads: new Set() };
        for (let i = 0; i < keys.length; i += 5000) {
          const r = await checkCallNumbers({ campaignId, keys: keys.slice(i, i + 5000) }).catch(() => null);
          if (!r || r.error) { setDone({ error: r?.error ?? "Couldn't check the numbers. Try again." }); return; }
          r.inCampaign?.forEach((k) => c.inCampaign.add(k)); r.dnc?.forEach((k) => c.dnc.add(k)); r.otherCalled?.forEach((k) => c.otherCalled.add(k)); r.leads?.forEach((k) => c.leads.add(k));
        }
        setCheck(c);
      } finally { setSaving(false); setProgress(""); }
      return;
    }
    const rows = !check ? built : built.filter((r) => { const k = keyOf(r); return !(skipWrong && check.invalid.has(k)) && !(skipOther && check.otherCalled.has(k)) && !(skipLeads && check.leads.has(k)); });
    if (!rows.length) { setDone({ error: "Nothing left to import after skipping those numbers." }); return; }
    const keep = role.flatMap((x, i) => (x === "keep" ? [label[i]!] : []));
    setSaving(true); setDone(undefined);
    let added = 0, duplicates = 0, dnc = 0;
    try {
      for (let i = 0; i < rows.length; i += PART) {
        setProgress(`${Math.min(i + PART, rows.length).toLocaleString()} of ${rows.length.toLocaleString()}…`);
        const last = i + PART >= rows.length;
        // One retry per part: a part that failed because the server was busy usually goes through the second time.
        let r = await importCallRows({ campaignId, rows: rows.slice(i, i + PART), last, keep, total: rows.length }).catch(() => null);
        if (!r) { await new Promise((ok) => setTimeout(ok, 3000)); r = await importCallRows({ campaignId, rows: rows.slice(i, i + PART), last, keep, total: rows.length }).catch(() => null); }
        if (!r || r.error) { setDone({ error: `${r?.error ?? "The server didn't answer."}${added ? ` ${added.toLocaleString()} number(s) were added before this; importing the same file again skips them.` : ""}` }); return; }
        added += r.added ?? 0; duplicates += r.duplicates ?? 0; dnc += r.dnc ?? 0;
      }
      setDone({ ok: true, message: `Added ${added.toLocaleString()} number${added === 1 ? "" : "s"}${duplicates > 0 ? `, skipped ${duplicates.toLocaleString()} duplicate(s)` : ""}${dnc ? `, ${dnc} on the do-not-call list` : ""}. Agents see the columns you chose on each call.` });
    } finally { setSaving(false); setProgress(""); }
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
      <form onSubmit={(e) => { e.preventDefault(); void save(e.currentTarget); }} className="space-y-3">
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
                  <td className="max-w-56 px-3 py-2 align-top text-xs text-muted"><span className="line-clamp-2">{(preview as Sheet).sample.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ") || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cur.includes("phone") && <p className="text-sm text-amber-700">Choose the column with the phone number.</p>}
        {!cur.includes("name") && !cur.includes("first") && !cur.includes("last") && <p className="text-sm text-amber-700">No name column chosen: agents will see “Unknown name”. Pick Full name, or First name and Last name.</p>}
        {check && (
          <div className="space-y-1.5 rounded-lg border border-line bg-canvas p-3 text-sm">
            <p className="font-medium">Number check</p>
            <ul className="space-y-0.5 text-xs">
              {check.noPhone > 0 && <li>⚪ {check.noPhone.toLocaleString()} row(s) have no phone number: skipped.</li>}
              {check.fileDup > 0 && <li>⚪ {check.fileDup.toLocaleString()} repeated in this file: added once.</li>}
              {check.inCampaign.size > 0 && <li>⚪ {check.inCampaign.size.toLocaleString()} already in this campaign: skipped.</li>}
              {check.dnc.size > 0 && <li>🔴 {check.dnc.size.toLocaleString()} on the do-not-call list: skipped.</li>}
              {check.invalid.size === 0 && check.otherCalled.size === 0 && check.leads.size === 0 && check.inCampaign.size === 0 && check.dnc.size === 0 && <li>✅ All numbers look fine.</li>}
            </ul>
            {check.invalid.size > 0 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={skipWrong} onChange={(e) => setSkipWrong(e.target.checked)} /> Skip {check.invalid.size.toLocaleString()} number(s) that look wrong (too short, too long or 0000…)</label>}
            {check.otherCalled.size > 0 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={skipOther} onChange={(e) => setSkipOther(e.target.checked)} /> Skip {check.otherCalled.size.toLocaleString()} number(s) already called in another campaign</label>}
            {check.leads.size > 0 && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={skipLeads} onChange={(e) => setSkipLeads(e.target.checked)} /> Skip {check.leads.size.toLocaleString()} number(s) that are already leads in the CRM</label>}
          </div>
        )}
        {done?.error && <p role="alert" className="text-sm text-red-700">{done.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || !cur.includes("phone")} className="inline-flex h-9 items-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">{saving ? (check ? `Importing ${progress}` : "Checking the numbers…") : check || !doCheck ? (check ? "Import now" : `Import ${preview.total?.toLocaleString()} rows`) : `Check ${preview.total?.toLocaleString()} rows`}</button>
          <button type="button" onClick={() => location.reload()} className="text-sm text-muted hover:text-ink">Choose another file</button>
        </div>
        <p className="text-xs text-muted">“Show to agent” columns (project, unit, nationality, what they bought…) appear on the agent&apos;s screen for each call; “Keep, hide from agents” columns are saved but only supervisors see them (change it later under What agents see). Duplicates and do-not-call numbers are skipped.</p>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-navy-900/30 hover:bg-canvas">
        <FileSpreadsheet className="size-6 text-muted" />
        <span className="text-sm font-medium">Choose an Excel (.xlsx) or CSV file</span>
        <span className="text-xs text-muted">First row = column names. Next you pick which column is the phone, the name and what the agent should see.</span>
        <input name="file" type="file" accept=".xlsx,.csv,text/csv" required className="mt-1 block w-full max-w-xs text-xs file:mr-2 file:rounded file:border-0 file:bg-navy-900 file:px-2 file:py-1 file:text-white" onChange={(e) => void read(e.currentTarget.files?.[0])} />
      </label>
      {reading && <p className="text-sm text-muted">Reading the file…</p>}
      {preview?.error && <p role="alert" className="text-sm text-red-700">{preview.error}</p>}
    </form>
  );
}
