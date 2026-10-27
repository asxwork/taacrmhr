import Link from "next/link";
import { headers } from "next/headers";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Fingerprint, Network, RefreshCw, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addPullMachine, deleteMachine, saveCommKey, syncMachineNow, updateMachine } from "./actions";

export const metadata = { title: "Attendance machines" };
const TONE = { approved: "green", pending: "amber", blocked: "red" } as const;

/** Attendance → Machines: connect ZKTeco machines live (Cloud Server / ADMS) and approve them by serial number. */
export default async function MachinesPage() {
  const user = await requirePermission("hr.attendance");
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.attendance", "edit") === "all";
  const h = await headers();
  const host = (process.env.APP_URL ? new URL(process.env.APP_URL).host : h.get("x-forwarded-host") ?? h.get("host") ?? "your-domain.com").replace(/:\d+$/, "");
  const machines = await db.attendanceMachine.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const online = (d: Date | null) => !!d && Date.now() - d.getTime() < 5 * 60_000;

  return (
    <>
      <AutoRefresh seconds={15} />
      <PageHeader title="Attendance machines" description="Machines send punches here live over the internet. A new machine appears below as soon as it calls in; approve it once." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <Card className="overflow-hidden">
          {machines.length === 0 ? (
            <EmptyState title="Waiting for a machine" description="Set the machine's Cloud Server address (steps on the right). It shows up here within a minute; this page refreshes by itself." />
          ) : (
            <div className="divide-y divide-line">
              {machines.map((m) => (
                <div key={m.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`size-2.5 rounded-full ${online(m.lastSeenAt) ? "bg-emerald-500" : "bg-slate-400"}`} title={online(m.lastSeenAt) ? "Online" : "Offline"} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{m.name || "Attendance machine"} <span className="font-mono text-xs font-normal text-muted">{m.mode === "pull" ? `direct · ${m.serial}` : `SN ${m.serial}`}</span></p>
                      {m.info && <p className="text-xs text-muted">{m.info}</p>}
                      <p className="text-xs text-muted">
                        {online(m.lastSeenAt) ? "Online" : "Offline"}{m.lastSeenAt ? ` · last contact ${formatDistanceToNow(m.lastSeenAt, { addSuffix: true })}` : ""}{m.ip ? ` · ${m.ip}` : ""}
                        {` · ${m.punches} punch(es) received`}{m.lastPunchAt ? ` · last punch ${formatDistanceToNow(m.lastPunchAt, { addSuffix: true })}` : ""}
                      </p>
                    </div>
                    <Badge tone={TONE[m.status as keyof typeof TONE] ?? "neutral"}>{m.status === "pending" ? "Waiting for approval" : m.status}</Badge>
                  </div>
                  {m.mode === "pull" && m.lastError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Last try{m.lastSyncAt ? ` ${formatDistanceToNow(m.lastSyncAt, { addSuffix: true })}` : ""}: {m.lastError}</p>}
                  {m.unknownIds && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Machine user IDs not linked to anyone: <b>{m.unknownIds.split(",").slice(0, 30).join(", ")}</b>. Add them as each employee’s device user ID on{" "}
                      <Link href="/hr/attendance?import=1" className="underline">Attendance → Import from device</Link>, then their punches count.
                    </p>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={updateMachine} className="flex gap-2">
                        <input type="hidden" name="id" value={m.id} />
                        <input name="name" defaultValue={m.name ?? ""} placeholder="Name, e.g. Head office gate" className="input h-9 w-56" aria-label="Machine name" />
                        <button className="h-9 rounded-lg border border-line px-3 text-sm hover:bg-canvas">Rename</button>
                      </form>
                      {m.mode === "pull" && m.status === "approved" && (
                        <ActionForm action={syncMachineNow} className="flex items-center gap-2"><input type="hidden" name="id" value={m.id} /><SubmitButton className="h-9"><RefreshCw className="size-4" /> Fetch now</SubmitButton></ActionForm>
                      )}
                      {m.mode === "pull" && (
                        <ActionForm action={saveCommKey} className="flex items-center gap-2"><input type="hidden" name="id" value={m.id} /><input name="commKey" inputMode="numeric" placeholder={m.commKeyEnc ? "Comm Key ••••" : "Comm Key"} className="input h-9 w-28" aria-label="Comm Key" /><SubmitButton className="h-9" variant="secondary">Save key</SubmitButton></ActionForm>
                      )}
                      {m.status !== "approved" && <form action={updateMachine}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="approved" /><button className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"><CheckCircle2 className="size-4" /> Approve</button></form>}
                      {m.status !== "blocked" && <form action={updateMachine}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="blocked" /><button className="h-9 rounded-lg border border-red-300 px-3 text-sm text-red-700 hover:bg-red-50">Block</button></form>}
                      {user.isSuperAdmin && <form action={deleteMachine}><input type="hidden" name="id" value={m.id} /><button aria-label="Remove machine" title="Remove machine" className="rounded p-2 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></form>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
        {canEdit && (
          <Card className="h-fit p-6">
            <h2 className="mb-1 flex items-center gap-2 font-semibold"><Network className="size-4" /> Connect by IP and port</h2>
            <p className="mb-4 text-xs text-muted">For a machine reachable at a public IP (router port forwarding to the machine, usually port 4370). AMS connects and reads the punches.</p>
            <ActionForm action={addPullMachine} className="space-y-3">
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <input name="host" required placeholder="Public IP, e.g. 154.57.213.75" className="input" aria-label="Machine IP or domain" />
                <input name="port" type="number" defaultValue={4370} className="input" aria-label="Port" />
              </div>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <input name="name" placeholder="Name, e.g. Head office" className="input" aria-label="Machine name" />
                <input name="commKey" inputMode="numeric" placeholder="Comm Key" className="input" aria-label="Comm Key (blank if none)" />
              </div>
              <SubmitButton>Connect &amp; test</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">Already used by ResourceInn or another system? That’s fine: AMS only reads punches and changes nothing on the machine. Just copy the Comm Key shown in Menu → Comm. → Connection (leave blank if 0). For safety, allow port 4370 on the router only from the AMS server’s IP. New punches are read every time the sync URL runs (set a Hostinger cron every 10 minutes for /api/cron/machines?key=CRON_SECRET), and once a day automatically.</p>
          </Card>
        )}
        <Card className="h-fit p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Fingerprint className="size-4" /> Or: machine sends to AMS (Cloud Server)</h2>
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">A machine can send to only one Cloud Server. If ResourceInn (or another system) already uses this setting, don’t change it; use “Connect by IP” instead.</p>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>The machine needs internet: plug in a LAN cable (or Wi-Fi) and check <b>Comm. → Ethernet</b> has an IP and gateway.</li>
            <li>
              Open <b>Menu → Comm. → Cloud Server Setting</b> (on some models <b>ADMS</b>) and enter:
              <dl className="mt-2 space-y-1 rounded-lg bg-canvas/70 p-3 font-mono text-xs">
                <div className="flex justify-between gap-2"><dt className="text-muted">Server address</dt><dd className="break-all">{host}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted">Server port</dt><dd>443 (HTTPS on) · or 80</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted">Enable domain name</dt><dd>ON</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted">Proxy</dt><dd>OFF</dd></div>
              </dl>
            </li>
            <li>Restart the machine. Within a minute it appears on the left as <b>Waiting for approval</b>. Check the serial number (Menu → System Info → Device Info) and press <b>Approve</b>.</li>
            <li>Punch once on the machine: the punch count goes up here and the punch shows in <Link href="/hr/attendance/logs" className="underline">Attendance logs</Link>.</li>
            <li>Make sure each employee’s <b>device user ID</b> (their number on the machine) is set, otherwise their punches are listed above as not linked.</li>
          </ol>
          <p className="mt-4 text-xs text-muted">No Cloud Server menu? Use “Connect by IP” above, or <Link href="/hr/attendance?import=1" className="underline">Import from device</Link> with the USB file. The machine’s clock must be right (Menu → Date/Time).</p>
        </Card>
        </div>
      </div>
    </>
  );
}
