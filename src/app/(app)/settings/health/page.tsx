import { redirect } from "next/navigation";
import { stat } from "node:fs/promises";
import { format, formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { JOBS, beats, problems } from "@/lib/heartbeat";
import { backupConfig } from "@/lib/backup";
import { smtpConfigured } from "@/lib/mail";
import { APP_VERSION } from "@/lib/version";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { clearErrors, saveBanner } from "./actions";

export const metadata = { title: "System health" };
export const dynamic = "force-dynamic";

const started = Date.now();

/** Settings → System health (Super Admin): is everything running, and what went wrong recently. */
export default async function HealthPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/settings");
  const pings: number[] = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); await db.$queryRawUnsafe("SELECT 1"); pings.push(performance.now() - t); }
  const ms = Math.round(Math.min(...pings) * 10) / 10;
  const [list, b, cfg, lastBackup, errors, banner, counts] = await Promise.all([
    problems(), beats(), backupConfig(),
    db.backupRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" } }),
    db.errorLog.findMany({ orderBy: { lastAt: "desc" }, take: 40 }),
    db.setting.findUnique({ where: { key: "maintenance.banner" } }),
    Promise.all([db.user.count({ where: { active: true } }), db.employee.count({ where: { status: { not: "left" } } }), db.lead.count(), db.attendancePunch.count()]),
  ]);
  const url = process.env.DATABASE_URL ?? "";
  const dbSize = url.startsWith("file:") ? await stat(url.replace("file:", "").replace(/^\.\//, "prisma/")).then((s) => s.size).catch(() => null) : null;
  const ok = list.length === 0;

  return (
    <>
      <PageHeader title="System health" description={`Version ${APP_VERSION} · running for ${formatDistanceToNowStrict(started)} · checks every job, the backup and errors. Super Admins get a daily alert when something is wrong.`} />
      <Card className={`mb-4 flex items-start gap-3 p-4 ${ok ? "" : "border-amber-300 bg-amber-50"}`}>
        {ok ? <CheckCircle2 className="size-6 text-emerald-600" /> : <AlertTriangle className="size-6 text-amber-600" />}
        <div className="text-sm">
          <p className="font-medium">{ok ? "Everything looks fine" : "Needs attention"}</p>
          {!ok && <ul className="mt-1 list-disc space-y-0.5 pl-5">{list.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Database", `${ms} ms`, ms < 5 ? "fast" : ms < 25 ? "ok" : "slow"], ["Active logins", counts[0]], ["Employees", counts[1]], ["Leads", counts[2]]].map(([k, v, s]) => (
          <Card key={String(k)} className="p-4"><p className="text-xs text-muted">{k}</p><p className="text-2xl font-semibold tabular-nums">{v}</p>{s && <p className="text-xs text-muted">{s}{dbSize && k === "Database" ? ` · ${(dbSize / 1e6).toFixed(1)} MB` : ""}</p>}</Card>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-medium">Scheduled jobs</h2>
          <ul className="divide-y divide-line text-sm">
            {JOBS.map((j) => {
              const x = b[j.key];
              const late = x && (Date.now() - +new Date(x.at)) / 3600_000 > j.maxHours;
              return (
                <li key={j.key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1"><span className="block font-medium">{j.label}</span><code className="text-xs text-muted">{j.url}</code></span>
                  {!x ? <Badge>Never ran</Badge> : !x.ok ? <Badge tone="red">Failed</Badge> : late ? <Badge tone="amber">Late</Badge> : <Badge tone="green">OK</Badge>}
                  <span className="w-full text-xs text-muted sm:w-auto">{x ? formatDistanceToNowStrict(new Date(x.at), { addSuffix: true }) : "—"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="space-y-3 p-4 text-sm">
          <h2 className="font-medium">Setup checks</h2>
          {([
            ["Google Drive backup", cfg.refreshToken ? (lastBackup ? `last saved ${formatDistanceToNowStrict(lastBackup.startedAt, { addSuffix: true })}` : "connected, no backup yet") : "not connected"],
            ["Email (SMTP)", smtpConfigured() ? "set up" : "not set up — no emails are sent"],
            ["APP_URL", process.env.APP_URL || "not set — links in emails and onboarding will be wrong"],
            ["CRON_SECRET", process.env.CRON_SECRET && process.env.CRON_SECRET !== "change-me" ? "set" : "not set — scheduled jobs can't run"],
            ["Secret key for stored passwords", process.env.SIP_SECRET_KEY ? "set" : process.env.CRON_SECRET ? "using CRON_SECRET" : "missing"],
          ] as const).map(([k, v]) => <p key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></p>)}
          <ActionForm action={saveBanner} className="space-y-2 border-t border-line pt-3">
            <label className="block font-medium" htmlFor="banner">Maintenance banner</label>
            <input id="banner" name="banner" defaultValue={banner?.value ?? ""} placeholder="e.g. AMS will update at 8 PM — please save your work" className="input" />
            <p className="text-xs text-muted">Shown at the top for everyone. Leave empty and save to remove it.</p>
            <SubmitButton variant="secondary">Save banner</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Error log</h2>
        {errors.length > 0 && <form action={clearErrors}><button className="text-xs text-muted hover:text-red-600">Clear all</button></form>}
      </div>
      <Card className="overflow-hidden">
        {errors.length === 0 ? <EmptyState title="No errors" description="Server and browser errors appear here, grouped." /> : (
          <ul className="divide-y divide-line">
            {errors.map((e) => (
              <li key={e.id} className="px-4 py-2.5 text-sm">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <Badge tone={e.source === "server" ? "red" : "amber"}>{e.source}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium">{e.message}</span>
                    <span className="text-xs text-muted">{e.path ?? ""} · ×{e.count} · {format(e.lastAt, "d MMM h:mm a")}</span>
                  </summary>
                  {e.stack && <pre className="mt-2 max-h-60 overflow-auto rounded bg-canvas p-2 text-[11px] leading-snug">{e.stack}</pre>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
