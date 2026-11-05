import { redirect } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, CloudUpload, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { backupConfig, redirectUri } from "@/lib/backup";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { backupNow, disconnectDrive, saveBackupSettings } from "./actions";

export const metadata = { title: "Backup" };

const mb = (n: number | null) => (n == null ? "—" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

/** Settings → Backup (Super Admin only): daily backups of everything to the company Google Drive. */
export default async function BackupPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/settings");
  const sp = await searchParams;
  const [c, runs] = await Promise.all([backupConfig(), db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 35 })]);
  const connected = !!c.refreshToken;
  const running = runs.some((r) => r.status === "running" && +r.startedAt > Date.now() - 30 * 60_000);

  return (
    <>
      <PageHeader title="Backup" description={`Every day AMS saves a full copy of the database${c.includeFiles ? " and all uploaded files" : ""} to Google Drive and keeps the last ${c.keepDays} days. Only Super Admins see this page.`} />
      {sp.ok && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Google Drive connected.</p>}
      {sp.err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{sp.err}</p>}

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        {connected ? <CheckCircle2 className="size-6 text-emerald-600" /> : <XCircle className="size-6 text-muted" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{connected ? `Connected to ${c.email ?? "Google Drive"}` : "Google Drive isn't connected"}</p>
          <p className="text-xs text-muted">{connected ? "Backups go to the “AMS backups” folder in this Drive." : "Fill in the Google keys below, save, then connect."}</p>
        </div>
        {connected && <form action={backupNow}><Button disabled={running}><CloudUpload className="size-4" /> {running ? "Backing up…" : "Back up now"}</Button></form>}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load: this redirects to Google */}
        {c.clientId && c.clientSecret && <a href="/api/backup/google/connect" className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-canvas">{connected ? "Reconnect" : "Connect Google Drive"}</a>}
        {connected && <form action={disconnectDrive}><button className="text-sm text-muted hover:text-red-600">Disconnect</button></form>}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-medium">Settings</h2>
          <ActionForm action={saveBackupSettings} className="space-y-4">
            <Field label="Google OAuth client ID"><input name="clientId" required defaultValue={c.clientId ?? ""} className="input font-mono text-xs" placeholder="1234-abc.apps.googleusercontent.com" /></Field>
            <Field label="Google OAuth client secret" hint={c.clientSecret ? "Saved — leave empty to keep it." : undefined}><input name="clientSecret" type="password" autoComplete="off" className="input" placeholder={c.clientSecret ? "••••••••" : ""} /></Field>
            <Field label="Keep backups for (days)"><input name="keepDays" type="number" min={7} max={365} defaultValue={c.keepDays} className="input w-32" /></Field>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="includeFiles" defaultChecked={c.includeFiles} className="mt-1" />
              <span>Also back up uploaded files (photos, CNICs, documents, recordings). Uses more Drive space.</span></label>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5 text-sm">
          <h2 className="mb-3 font-medium">One-time Google setup (10 minutes)</h2>
          <ol className="list-decimal space-y-2 pl-5 text-muted">
            <li>Open <span className="font-medium text-ink">console.cloud.google.com</span> with the Google account that should hold the backups and create a project (e.g. “AMS Backup”).</li>
            <li><span className="font-medium text-ink">APIs &amp; Services → Library</span>: enable <span className="font-medium text-ink">Google Drive API</span>.</li>
            <li><span className="font-medium text-ink">OAuth consent screen</span>: External, app name “AMS Backup”, your email. Then press <span className="font-medium text-ink">Publish app</span> (otherwise Google stops backups after 7 days).</li>
            <li><span className="font-medium text-ink">Credentials → Create credentials → OAuth client ID</span>, type <span className="font-medium text-ink">Web application</span>, and add this redirect URI:
              <input readOnly value={redirectUri()} aria-label="Redirect URI" className="input mt-1 h-8 w-full font-mono text-xs" /></li>
            <li>Copy the client ID and secret into Settings here, Save, then press <span className="font-medium text-ink">Connect Google Drive</span> and allow access.</li>
            <li>Add a daily cron in hPanel: <code className="break-all text-xs text-ink">/api/cron/backup?key=YOUR_CRON_SECRET</code> (the daily job also backs up as a fallback).</li>
          </ol>
          <p className="mt-3 text-xs text-muted">AMS can only see the files it creates in your Drive, nothing else.</p>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Recent backups</h2>
      <Card className="overflow-hidden">
        {runs.length === 0 ? <EmptyState title="No backups yet" /> : (
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <Badge tone={r.status === "ok" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status === "ok" ? "Saved" : r.status === "failed" ? "Failed" : "Running"}</Badge>
                <span className="font-medium">{format(r.startedAt, "EEE d MMM yyyy, h:mm a")}</span>
                <span className="text-xs text-muted">{r.trigger === "manual" ? "by hand" : "daily"} · {formatDistanceToNowStrict(r.startedAt, { addSuffix: true })}</span>
                <span className="flex-1" />
                {r.status === "ok" && <span className="text-xs text-muted">{mb(r.sizeBytes)}</span>}
                {r.status === "ok" && r.driveFileId && <a href={`https://drive.google.com/file/d/${r.driveFileId}/view`} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy-900 hover:underline">Open in Drive</a>}
                {r.error && <span className="w-full text-xs text-red-600">{r.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
