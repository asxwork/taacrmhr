"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "@/components/link";
import { AlertTriangle, CheckCircle2, CloudUpload, Loader2 } from "lucide-react";
import { Card } from "@/components/ui";
import { bitrixBackupInfo, bitrixBackupNow, bitrixBackupSwitch } from "./actions";

type Info = Awaited<ReturnType<typeof bitrixBackupInfo>>;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");

/** Daily full Bitrix copy in Google Drive (AMS backups / Bitrix backups). */
export function BackupPanel({ initial }: { initial: Info }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!s.running && !pending) return;
    const t = setTimeout(() => { bitrixBackupInfo().then(setS).catch(() => {}); }, 3000);
    return () => clearTimeout(t);
  }, [s, pending]);
  const act = (fn: () => Promise<unknown>) => start(async () => { setMsg(""); const r = (await fn()) as { error?: string } | undefined; if (r?.error) setMsg(r.error); setS(await bitrixBackupInfo()); });

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">{s.running ? <Loader2 className="size-5 animate-spin" /> : <CloudUpload className="size-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Full Bitrix backup to Google Drive</p>
          <p className="text-sm text-muted">Every day: all Bitrix leads with their activities, comments, stage history and people, as an Excel file plus a complete copy of every field. Saved in Drive under <b className="text-ink">AMS backups → Bitrix backups</b>.</p>
          {s.running && s.step && <p className="mt-1 text-sm">{s.step}</p>}
        </div>
        <button type="button" disabled={pending || s.running || !s.drive} onClick={() => act(bitrixBackupNow)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50"><CloudUpload className="size-4" /> Back up now</button>
      </div>
      {!s.drive && <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>Google Drive isn&apos;t connected yet. Connect it in <Link href="/settings/backup" className="font-medium underline">Settings → Backup</Link>, then come back.</span></p>}
      {msg && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      {s.lastAt && !s.running && (
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${s.lastOk ? "bg-canvas" : "bg-red-50 text-red-800"}`}>
          <p className="flex items-center gap-2 font-medium">{s.lastOk ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4" />}Last backup {when(s.lastAt)}</p>
          <p className="mt-1">{s.message}</p>
        </div>
      )}
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={s.enabled} disabled={pending} onChange={(e) => act(() => bitrixBackupSwitch(e.target.checked))} className="accent-navy-900" /> Back up automatically every day (old copies are removed after the days set in Settings → Backup)</label>
    </Card>
  );
}
