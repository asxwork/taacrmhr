"use client";

import { useActionState } from "react";
import Link from "@/components/link";
import { AlertTriangle, CheckCircle2, UserX } from "lucide-react";
import { SubmitButton } from "@/components/action-form";
import { Badge, Card } from "@/components/ui";
import { bitrixStep, type BitrixState } from "./actions";

export function BitrixImporter() {
  const [state, act] = useActionState<BitrixState, FormData>(bitrixStep, undefined);
  const error = state?.error && <p role="alert" className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;

  if (state?.done) {
    const d = state.done;
    return (
      <Card className="p-6">
        <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="size-5" /> Import finished in {d.seconds} s</p>
        <ul className="mt-3 space-y-1 text-sm">
          {d.deleted > 0 && <li>{d.deleted} demo leads deleted first</li>}
          <li><b>{d.leads}</b> leads imported{d.skipped ? ` (${d.skipped} were already in AMS and were skipped)` : ""}</li>
          <li><b>{d.activities}</b> activities (tasks, to-dos, calls)</li>
          <li><b>{d.history}</b> stage changes on the leads&apos; timelines</li>
        </ul>
        <Link href="/crm/leads" className="mt-4 inline-block font-medium text-navy-900 hover:underline">Open Leads →</Link>
      </Card>
    );
  }

  if (state?.preview && state.id) {
    const p = state.preview;
    const missing = p.owners.filter((o) => !o.userId);
    return (
      <form action={act} className="space-y-5">
        {error}
        <input type="hidden" name="step" value="import" />
        <input type="hidden" name="id" value={state.id} />
        <Card className="p-5">
          <p className="mb-3 font-medium">Found in the files</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[["Leads", p.leads], ["Activities", p.activities], ["Stage changes", p.history]].map(([l, n]) => <div key={l} className="rounded-lg bg-canvas p-3"><p className="text-2xl font-semibold tabular-nums">{n}</p><p className="text-xs text-muted">{l}</p></div>)}
          </div>
          {p.already > 0 && <p className="mt-3 text-sm text-muted">{p.already} of these leads are already in AMS and will be skipped.</p>}
          {p.ignored.length > 0 && <p className="mt-2 text-xs text-muted">Not used: {p.ignored.join(", ")} (summary files).</p>}
        </Card>
        <Card className="p-5">
          <p className="mb-1 font-medium">Agents</p>
          <p className="mb-3 text-sm text-muted">Each lead goes to the AMS login with the same name. The Bitrix company account (&ldquo;The Advisor Associates&rdquo;) goes to you.</p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {p.owners.map((o) => <li key={o.name} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5">{o.userId ? <CheckCircle2 className="size-4 text-emerald-600" /> : <UserX className="size-4 text-amber-600" />}{o.name || "(nobody)"}</span><span className="tabular-nums text-muted">{o.n}</span></li>)}
          </ul>
          {missing.length > 0 && (
            <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><b>{missing.length} people have no AMS login</b> ({missing.reduce((s, o) => s + o.n, 0)} leads). Their leads come in without an owner, with &ldquo;Bitrix owner: name&rdquo; in the notes. To give them their leads, add their logins in <Link href="/settings/users" className="underline">Settings → Users</Link> first (same name as in Bitrix), then check the files again.</span></p>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-medium">Stages and sources</p>
          <div className="flex flex-wrap gap-1.5">{p.stages.map((s) => <Badge key={s.name} tone={s.exists ? "neutral" : "gold"}>{s.name}{s.as !== s.name ? ` → ${s.as}` : ""} · {s.n}{s.exists ? "" : " (new)"}</Badge>)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{p.sources.map((s) => <Badge key={s.name} tone={s.exists ? "neutral" : "gold"}>{s.name} · {s.n}{s.exists ? "" : " (new)"}</Badge>)}</div>
          <p className="mt-2 text-xs text-muted">Gold ones are added to AMS. The Bitrix lead ID becomes the AMS lead number.</p>
        </Card>
        <Card className="space-y-3 p-5">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="deleteDemo" defaultChecked={p.demo > 0} className="mt-0.5 accent-red-600" /><span><b>Delete the {p.demo} leads already in AMS that didn&apos;t come from Bitrix</b> (the demo leads), with their activities. Deals and contacts stay.</span></label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Importing… (about a minute)">Import {p.leads - p.already} leads</SubmitButton>
          </div>
        </Card>
      </form>
    );
  }

  return (
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
  );
}
