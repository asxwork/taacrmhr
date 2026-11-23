"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field } from "@/components/ui";
import { SYNC_EVERY } from "@/lib/bitrix-sync-shared";
import { bitrixSyncNow, bitrixSyncSettings, bitrixSyncState, connectBitrixSync } from "./actions";

type Status = Awaited<ReturnType<typeof bitrixSyncState>>;
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - +new Date(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleString();
};
const label = (n: number) => (n < 60 ? `${n} minutes` : n === 60 ? "hour" : `${n / 60} hours`);

export function SyncPanel({ initial }: { initial: Status }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  // Refresh the status every few seconds while a sync runs, every 30 s otherwise.
  useEffect(() => {
    const t = setTimeout(() => { bitrixSyncState().then(setS).catch(() => {}); }, s.running ? 2500 : 30_000);
    return () => clearTimeout(t);
  }, [s]);
  const act = (fn: () => Promise<unknown>) => start(async () => { setMsg(""); const r = (await fn()) as { error?: string } | undefined; if (r?.error) setMsg(r.error); setS(await bitrixSyncState()); });

  if (!s.connected) {
    return (
      <Card className="space-y-4 p-6">
        {!s.canStore && <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" />The server has no secret key to keep the link safe. Add SIP_SECRET_KEY (or CRON_SECRET) in the hosting settings first.</p>}
        <div className="text-sm">
          <p className="font-medium">Connect your Bitrix24</p>
          <p className="mt-1 text-muted">In Bitrix: <b className="text-ink">Developer resources → Other → Inbound webhook</b>, tick <b className="text-ink">CRM</b> and <b className="text-ink">Users</b>, save, and paste the <b className="text-ink">Webhook to call REST API</b> link here. You can use the same one as for the import.</p>
        </div>
        <ActionForm action={connectBitrixSync} className="space-y-3">
          <Field label="Bitrix webhook link"><input name="webhook" type="url" required autoComplete="off" spellCheck={false} placeholder="https://yourcompany.bitrix24.com/rest/1/abc123xyz…/" className="input font-mono text-sm" /></Field>
          <Field label="Check Bitrix every">
            <select name="every" defaultValue={15} className="input w-48">{SYNC_EVERY.map((n) => <option key={n} value={n}>{label(n)}</option>)}</select>
          </Field>
          <SubmitButton pendingText="Checking the link…"><Link2 className="size-4" /> Connect and sync</SubmitButton>
        </ActionForm>
        <p className="text-xs text-muted">The first sync reads everything once (leads already in AMS are updated, never added twice); after that only what changed. AMS only reads from Bitrix. The link is stored encrypted.</p>
      </Card>
    );
  }

  const r = s.result;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${s.enabled ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-muted"}`}>{s.running ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{s.running ? "Syncing now…" : s.enabled ? "Sync is on" : "Sync is paused"}</p>
            <p className="text-sm text-muted">Connected to <b className="text-ink">{s.portal}</b> · last synced {ago(s.last)}{s.enabled ? ` · every ${label(s.every)}` : ""}</p>
            {s.running && s.step && <p className="mt-1 text-sm">{s.step}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || s.running} onClick={() => act(() => bitrixSyncNow(false))} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50"><RefreshCw className="size-4" /> Sync now</button>
            <button type="button" disabled={pending || s.running} onClick={() => act(() => bitrixSyncNow(true))} title="Read every lead again (slower); updates stages and responsible people of all leads" className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm hover:bg-canvas disabled:opacity-50">Full sync</button>
          </div>
        </div>
        {msg && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
        {r && !s.running && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${r.ok ? "bg-canvas" : "bg-red-50 text-red-800"}`}>
            <p className="flex items-center gap-2 font-medium">{r.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4" />}Last run {ago(r.at)}{r.seconds !== undefined ? ` (${r.seconds}s)` : ""}</p>
            <p className="mt-1">{r.message}</p>
            {!!r.unmatched?.length && <p className="mt-1 text-xs text-amber-800">No AMS person matches these Bitrix names, so their new leads have no responsible person yet: <b>{r.unmatched.join(", ")}</b>. Add them in Settings → Users with the same name (they&apos;re picked up on the next sync).</p>}
          </div>
        )}
      </Card>
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.enabled} disabled={pending} onChange={(e) => act(() => bitrixSyncSettings({ enabled: e.target.checked }))} className="accent-navy-900" /> Sync automatically</label>
        <label className="flex items-center gap-2">Every
          <select value={s.every} disabled={pending} onChange={(e) => act(() => bitrixSyncSettings({ every: Number(e.target.value) }))} className="input h-8 w-36 py-0 text-sm">{SYNC_EVERY.map((n) => <option key={n} value={n}>{label(n)}</option>)}</select>
        </label>
        <button type="button" disabled={pending} onClick={() => confirm("Disconnect Bitrix? Leads already synced stay in AMS.") && act(() => bitrixSyncSettings({ disconnect: true }))} className="ml-auto inline-flex items-center gap-1.5 text-red-700 hover:underline"><Unplug className="size-4" /> Disconnect</button>
      </Card>
      <p className="text-xs text-muted">What comes over: new leads; for existing leads, the stage, responsible person, phone/e-mail and project when they change in Bitrix; new activities, timeline comments and stage changes. Only Bitrix → AMS: changes made in AMS aren&apos;t sent to Bitrix, and a change made later in Bitrix wins. It runs while anyone uses AMS (or from the hosting cron at /api/cron/bitrix).</p>
    </div>
  );
}
