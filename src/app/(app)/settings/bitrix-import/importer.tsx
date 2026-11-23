"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "@/components/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Link2, Loader2, UserX } from "lucide-react";
import { SubmitButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui";
import { bitrixFetchStatus, bitrixStep, startBitrixFetch, type BitrixState } from "./actions";

export function BitrixImporter() {
  const [state, act] = useActionState<BitrixState, FormData>(bitrixStep, undefined);
  // Read straight from Bitrix (Connect) → the same preview as checked files.
  const [fetched, setFetched] = useState<{ id: string; preview: NonNullable<BitrixState>["preview"] } | null>(null);
  const [mode, setMode] = useState<"connect" | "files">("connect");
  const error = state?.error && <p role="alert" className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;

  if (state?.done) {
    const d = state.done;
    return (
      <Card className="p-6">
        <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="size-5" /> Import finished in {d.seconds} s</p>
        <ul className="mt-3 space-y-1 text-sm">
          {d.deleted > 0 && <li>{d.deleted} demo leads deleted first</li>}
          <li><b>{d.leads}</b> leads imported{d.skipped ? ` (${d.skipped} were already in AMS and were skipped)` : ""}</li>
          <li><b>{d.activities}</b> activities (tasks, to-dos, calls)
            <span className="block text-xs text-muted">
              In the file: {d.activityReport.inFile}{d.activityReport.inFile === 0 ? " — no activities file was recognised; select the activities report with the others" : ""}
              {d.activityReport.alreadyThere > 0 && ` · already in AMS: ${d.activityReport.alreadyThere}`}
              {d.activityReport.noLead > 0 && ` · skipped ${d.activityReport.noLead} whose lead isn't in the leads file`}
              {d.activityReport.failed > 0 && ` · ${d.activityReport.failed} couldn't be saved (listed below)`}
            </span>
          </li>
          <li><b>{d.comments}</b> timeline comments
            <span className="block text-xs text-muted">{d.commentReport.inFile ? <>Found: {d.commentReport.inFile}{d.commentReport.alreadyThere > 0 && ` · already in AMS: ${d.commentReport.alreadyThere}`}</> : "None were in the import (comments come with Connect to Bitrix, not with the SQL Lab files)."}</span>
          </li>
          <li><b>{d.history}</b> stage changes on the leads&apos; timelines
            <span className="block text-xs text-muted">In the file: {d.historyReport.inFile} rows{d.historyReport.inFile === 10000 ? " — exactly 10,000 means SQL Lab cut the export: the newest leads miss their history. Export it in two parts (by date) and select both." : ""}{d.historyReport.alreadyThere > 0 ? ` · already in AMS: ${d.historyReport.alreadyThere}` : ""}. Repeated stages in a row count once.</span>
          </li>
          {d.failed > 0 && (
            <li className="text-red-700"><b>{d.failed}</b> rows could not be saved (everything else was):
              <ul className="mt-1 list-disc pl-5 text-xs">{d.failedList.map((f, i) => <li key={i}>{f.what}: {f.why}</li>)}</ul>
            </li>
          )}
        </ul>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/crm/leads" className="font-medium text-navy-900 hover:underline">Open Leads →</Link>
          <Link href="/crm/duplicates" className="font-medium text-navy-900 hover:underline">Check for duplicate leads →</Link>
        </div>
      </Card>
    );
  }

  const shown = state?.preview && state.id ? { id: state.id, preview: state.preview } : fetched;
  if (shown?.preview && !state?.done) {
    const p = shown.preview;
    const missing = p.owners.filter((o) => !o.userId);
    return (
      <form action={act} className="space-y-5">
        {error}
        <input type="hidden" name="step" value="import" />
        <input type="hidden" name="id" value={shown.id} />
        <Card className="p-5">
          <p className="mb-3 font-medium">Found in the files</p>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[["Leads", p.leads], ["Activities", p.activities], ["Comments", p.comments], ["Stage changes", p.history]].map(([l, n]) => <div key={l} className="rounded-lg bg-canvas p-3"><p className="text-2xl font-semibold tabular-nums">{Number(n).toLocaleString()}</p><p className="text-xs text-muted">{l}</p></div>)}
          </div>
          {p.already > 0 && <p className="mt-3 text-sm text-muted">{p.already} of these leads are already in AMS: they aren&apos;t added twice, but any activities and stage history they&apos;re missing are added.</p>}
          {p.ignored.length > 0 && <p className="mt-2 text-xs text-muted">Not used: {p.ignored.join(", ")} (summary files).</p>}
        </Card>
        <Card className="p-5">
          <p className="mb-1 font-medium">Responsible person</p>
          <p className="mb-3 text-sm text-muted">AMS picked the person with the same (or nearly the same) name. Change any of them here; the Bitrix company account (&ldquo;The Advisor Associates&rdquo;) goes to you unless you pick someone.</p>
          <ul className="divide-y divide-line text-sm">
            {p.owners.map((o) => (
              <li key={o.name} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="flex min-w-40 flex-1 items-center gap-1.5">{o.userId ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <UserX className="size-4 shrink-0 text-amber-600" />}{o.name || "(nobody)"} <span className="tabular-nums text-xs text-muted">· {o.n}</span></span>
                {o.name && (
                  <select name={`owner:${o.name}`} defaultValue={o.userId && o.userId !== "admin" ? o.userId : o.userId === "admin" ? "" : "__old"} aria-label={`AMS person for ${o.name}`} className={`input h-8 w-64 py-0 text-sm ${o.userId ? "" : "border-amber-300 bg-amber-50"}`}>
                    <option value="">{o.userId === "admin" ? "Me (the importer)" : "— No owner —"}</option>
                    {/* "__old" = NEW_OLD_EMPLOYEE in lib/bitrix-import.ts */}
                    {!o.userId && <option value="__old">Add as old employee (inactive)</option>}
                    {p.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><b>{missing.length} Bitrix names have no match</b> ({missing.reduce((s, o) => s + o.n, 0)} leads). They&apos;re set to <b>Add as old employee</b>: AMS makes an inactive login with that name, so their leads keep their responsible person and only a Super Admin can change those leads. Or pick a current person above.</span></p>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-1 font-medium">Project</p>
          {p.projectColumn ? (
            <>
              <p className="mb-2 text-sm text-muted">From the column &ldquo;{p.projectColumn}&rdquo;. Projects in your Inventory list are linked; the others are kept as typed (shown as the lead&apos;s project, editable later).</p>
              <div className="flex flex-wrap gap-1.5">{p.projects.slice(0, 40).map((x) => <Badge key={x.name} tone={x.inList ? "neutral" : "gold"}>{x.name} · {x.n}</Badge>)}</div>
            </>
          ) : (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>The leads file has no project column, so leads come in without a project. In Bitrix, Project is a custom field (its column is named like <code>uf_crm_…</code>): add it to the SQL Lab query and name it <b>project</b>, then export again.</span></p>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-medium">Stages and sources</p>
          <div className="flex flex-wrap gap-1.5">{p.stages.map((s) => <Badge key={s.name} tone={s.exists ? "neutral" : "gold"}>{s.name}{s.as !== s.name ? ` → ${s.as}` : ""} · {s.n}{s.exists ? "" : " (new)"}</Badge>)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{p.sources.map((s) => <Badge key={s.name} tone={s.exists ? "neutral" : "gold"}>{s.name} · {s.n}{s.exists ? "" : " (new)"}</Badge>)}</div>
          <p className="mt-2 text-xs text-muted">Gold ones are added to AMS. The Bitrix lead ID becomes the AMS lead number.</p>
        </Card>
        <Card className="space-y-3 p-5">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="deleteDemo" className="mt-0.5 accent-red-600" /><span><b>Delete the {p.demo} leads already in AMS that didn&apos;t come from Bitrix</b>, with their activities. Only for clearing demo leads: it also deletes real leads added in AMS (Facebook, website, typed in). Deals and contacts stay.</span></label>
          {shown === fetched && (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="keepSync" defaultChecked className="mt-0.5 accent-navy-900" /><span><b>Keep AMS in sync with Bitrix</b>: every 15 minutes, new leads and changes made in Bitrix come in automatically (change it in Settings → CRM → Bitrix sync).</span></label>
          )}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Importing… (about a minute)">{p.leads - p.already > 0 ? `Import ${p.leads - p.already} leads` : "Add their missing activities & history"}</SubmitButton>
          </div>
        </Card>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {([["connect", Link2, "Connect to Bitrix", "Recommended: everything, including timeline comments"], ["files", FileSpreadsheet, "Upload SQL Lab files", "Leads, activities and stage history (no comments)"]] as const).map(([k, Icon, t, d]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${mode === k ? "border-navy-900 bg-navy-900/[0.04] ring-1 ring-navy-900" : "border-line hover:bg-canvas"}`}>
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${mode === k ? "bg-navy-900 text-white" : "bg-canvas text-muted"}`}><Icon className="size-4" /></span>
            <span><b className="block text-sm">{t}</b><span className="text-xs text-muted">{d}</span></span>
          </button>
        ))}
      </div>
      {mode === "connect" ? <Connect onDone={setFetched} /> : (
    <form action={act}>
      <Card className="space-y-4 p-6">
        {error}
        <input type="hidden" name="step" value="check" />
        <p className="text-sm">Select <b>all the Bitrix CSV files at once</b>: the leads report, the activities report and the stage-history report. AMS recognises each one by its columns; summary files are ignored.</p>
        <input type="file" name="files" accept=".csv,text/csv" multiple required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
        <SubmitButton pendingText="Checking…">Check files</SubmitButton>
        <p className="text-xs text-muted">Nothing is changed until you confirm on the next step. Leads already imported are skipped, so it&apos;s safe to run again.</p>
      </Card>
    </form>
      )}
    </div>
  );
}

/** Paste the Bitrix webhook link → AMS reads everything in the background and shows what it found. */
function Connect({ onDone }: { onDone: (r: { id: string; preview: NonNullable<BitrixState>["preview"] }) => void }) {
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!job) return;
    let stop = false;
    const tick = async () => {
      const r = await bitrixFetchStatus(job).catch(() => ({ error: undefined, step: undefined, result: undefined, seconds: undefined }));
      if (stop) return;
      if (r.step) setStep(r.step);
      if (r.seconds) setSecs(r.seconds);
      if (r.error) { setError(r.error); setJob(null); return; }
      if (r.result) { onDone({ id: r.result.id, preview: r.result.preview }); return; }
      setTimeout(tick, 2500);
    };
    void tick();
    return () => { stop = true; };
  }, [job, onDone]);

  return (
    <Card className="space-y-4 p-6">
      {error && <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="text-sm">
        <p className="font-medium">1. Make a webhook in Bitrix24</p>
        <p className="mt-1 text-muted">In Bitrix: <b className="text-ink">Developer resources → Other → Inbound webhook</b>. Tick the permissions <b className="text-ink">CRM (crm)</b> and <b className="text-ink">Users (user)</b>, save, and copy the <b className="text-ink">Webhook to call REST API</b> link.</p>
        <p className="mt-3 font-medium">2. Paste it here</p>
      </div>
      <form onSubmit={async (e) => { e.preventDefault(); setError(""); setStep("Starting…"); setSecs(0); const r = await startBitrixFetch(url); if (r.error) { setError(r.error); setStep(""); } else if (r.job) setJob(r.job); }} className="space-y-3">
        <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={!!job} required type="url" autoComplete="off" spellCheck={false} placeholder="https://yourcompany.bitrix24.com/rest/1/abc123xyz…/" className="input font-mono text-sm" aria-label="Bitrix webhook link" />
        {job ? (
          <div className="flex items-start gap-3 rounded-lg bg-canvas px-4 py-3 text-sm">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-navy-900" />
            <div><p className="font-medium">{step}</p><p className="text-xs text-muted">{secs}s · usually 2–5 minutes for a few thousand leads. You can leave this page open; nothing is changed in AMS or Bitrix yet.</p></div>
          </div>
        ) : <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"><Link2 className="size-4" /> Read everything from Bitrix</button>}
      </form>
      <p className="text-xs text-muted">AMS only <b>reads</b> from Bitrix: leads, activities, timeline comments, stage history and the names of your people. The link is used for this run only and isn&apos;t saved; you can delete the webhook in Bitrix afterwards. Next you&apos;ll check responsible people and projects before anything is imported.</p>
    </Card>
  );
}
