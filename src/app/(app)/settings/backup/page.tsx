import { redirect } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, CloudUpload, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BACKUP_GROUPS, backupConfig, driveFromServer, googleKeysOnServer, redirectUri } from "@/lib/backup";
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
  const onServer = googleKeysOnServer();
  const running = runs.some((r) => r.status === "running" && +r.startedAt > Date.now() - 30 * 60_000);

  return (
    <>
      <PageHeader title="Backup" description={`Every day AMS saves a separate backup of each app (${BACKUP_GROUPS.map((g) => g.label).join(", ")})${c.includeFiles ? " and all uploaded files" : ""} to Google Drive and keeps the last ${c.keepDays} days. Only Super Admins see this page.`} />
      {sp.ok && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Google Drive connected.</p>}
      {sp.err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{sp.err}</p>}

      <Card className="mb-4 p-6">
        {connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <CheckCircle2 className="size-7 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Connected to {c.email ?? "Google Drive"}</p>
              <p className="text-xs text-muted">Backups go to the “AMS backups” folder in this Google Drive, one dated folder per backup.{onServer && " Google keys are read from the server's environment variables."}{driveFromServer() && " Connected through G_REFRESH_TOKEN on the server."}</p>
            </div>
            <form action={backupNow}><Button disabled={running}><CloudUpload className="size-4" /> {running ? "Backing up…" : "Back up now"}</Button></form>
            {!driveFromServer() && <form action={disconnectDrive}><button className="text-sm text-muted hover:text-red-600">Disconnect</button></form>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="size-8 text-muted" />
            <p className="font-medium">Google Drive isn&apos;t connected</p>
            <p className="max-w-md text-sm text-muted">Sign in with the Google account that should keep the backups. AMS can only see the files it saves there — nothing else in that Drive.</p>
            {c.clientId && c.clientSecret ? (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load: this redirects to Google
              <a href="/api/backup/google/connect" className="mt-1 inline-flex items-center gap-3 rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium text-[#1f1f1f] shadow-sm hover:bg-[#f8f9fa]">
                <svg viewBox="0 0 48 48" className="size-5" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.3 5.7c4.3-3.9 7-9.7 7-17.2z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
                Sign in with Google
              </a>
            ) : (
              <p className="max-w-md rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">One-time setup: add <code>G_CLIENT_ID</code> and <code>G_CLIENT_SECRET</code> (or <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>) to the server&apos;s environment variables and Redeploy; then this button appears.</p>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-medium">Settings</h2>
          <ActionForm action={saveBackupSettings} className="space-y-4">
            {!onServer && (
              <details className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm text-muted">Advanced: enter the Google keys here instead of on the server</summary>
                <div className="mt-3 space-y-3">
                  <Field label="Google OAuth client ID"><input name="clientId" defaultValue={c.clientId ?? ""} className="input font-mono text-xs" placeholder="1234-abc.apps.googleusercontent.com" /></Field>
                  <Field label="Google OAuth client secret" hint={c.clientSecret ? "Saved — leave empty to keep it." : undefined}><input name="clientSecret" type="password" autoComplete="off" className="input" placeholder={c.clientSecret ? "••••••••" : ""} /></Field>
                </div>
              </details>
            )}
            <Field label="Keep backups for (days)"><input name="keepDays" type="number" min={7} max={365} defaultValue={c.keepDays} className="input w-32" /></Field>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="includeFiles" defaultChecked={c.includeFiles} className="mt-1" />
              <span>Also back up uploaded files (photos, CNICs, documents, recordings). Uses more Drive space.</span></label>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        {onServer ? (
          <Card className="p-5 text-sm"><h2 className="mb-2 font-medium">How it works</h2><ul className="list-disc space-y-1 pl-5 text-muted"><li>Google keys come from the server (G_CLIENT_ID / G_CLIENT_SECRET): nothing to type here. Sign in once; the connection stays across redeploys.</li><li>Every night AMS saves a dated folder in “AMS backups” with one file per app: {BACKUP_GROUPS.map((g) => g.label).join(", ")}{c.includeFiles ? ", plus uploaded files" : ""}.</li><li>Backups older than the days you choose are deleted automatically.</li><li>To use a different Google account, Disconnect and sign in again.</li></ul></Card>
        ) : (
          <Card className="p-5 text-sm">
          <h2 className="mb-3 font-medium">One-time setup for the developer (10 minutes, never again)</h2>
          <ol className="list-decimal space-y-2 pl-5 text-muted">
            <li>Open <span className="font-medium text-ink">console.cloud.google.com</span> with the Google account that should hold the backups and create a project (e.g. “AMS Backup”).</li>
            <li><span className="font-medium text-ink">APIs &amp; Services → Library</span>: enable <span className="font-medium text-ink">Google Drive API</span>.</li>
            <li><span className="font-medium text-ink">OAuth consent screen</span>: External, app name “AMS Backup”, your email. Then press <span className="font-medium text-ink">Publish app</span> (otherwise Google stops backups after 7 days).</li>
            <li><span className="font-medium text-ink">Credentials → Create credentials → OAuth client ID</span>, type <span className="font-medium text-ink">Web application</span>, and add this redirect URI:
              <input readOnly value={redirectUri()} aria-label="Redirect URI" className="input mt-1 h-8 w-full font-mono text-xs" /></li>
            <li>In hPanel → your Node.js app → <span className="font-medium text-ink">Environment variables</span>, add <code className="text-ink">G_CLIENT_ID</code> and <code className="text-ink">G_CLIENT_SECRET</code>, then Redeploy. From then on this page is just “Sign in with Google”.</li>
            <li>Add a daily cron in hPanel: <code className="break-all text-xs text-ink">/api/cron/backup?key=YOUR_CRON_SECRET</code> (the daily job also backs up as a fallback).</li>
          </ol>
          <p className="mt-3 text-xs text-muted">AMS can only see the files it creates in your Drive, nothing else.</p>
        </Card>
        )}
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
                {r.status === "ok" && r.fileName?.startsWith("folder:") && <span className="flex flex-wrap gap-1">{r.fileName.slice(7).split(",").map((k) => <span key={k} className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">{BACKUP_GROUPS.find((g) => g.key === k)?.label ?? "Files"}</span>)}</span>}
                {r.status === "ok" && r.driveFileId && <a href={r.fileName?.startsWith("folder:") ? `https://drive.google.com/drive/folders/${r.driveFileId}` : `https://drive.google.com/file/d/${r.driveFileId}/view`} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy-900 hover:underline">Open in Drive</a>}
                {r.error && <span className="w-full text-xs text-red-600">{r.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
