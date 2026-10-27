import Link from "next/link";
import { headers } from "next/headers";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Fingerprint, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { deleteMachine, updateMachine } from "./actions";

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
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
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
                      <p className="font-semibold">{m.name || "Attendance machine"} <span className="font-mono text-xs font-normal text-muted">SN {m.serial}</span></p>
                      <p className="text-xs text-muted">
                        {online(m.lastSeenAt) ? "Online" : "Offline"}{m.lastSeenAt ? ` · last contact ${formatDistanceToNow(m.lastSeenAt, { addSuffix: true })}` : ""}{m.ip ? ` · ${m.ip}` : ""}
                        {` · ${m.punches} punch(es) received`}{m.lastPunchAt ? ` · last punch ${formatDistanceToNow(m.lastPunchAt, { addSuffix: true })}` : ""}
                      </p>
                    </div>
                    <Badge tone={TONE[m.status as keyof typeof TONE] ?? "neutral"}>{m.status === "pending" ? "Waiting for approval" : m.status}</Badge>
                  </div>
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

        <Card className="h-fit p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Fingerprint className="size-4" /> Connect a ZKTeco machine</h2>
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
          <p className="mt-4 text-xs text-muted">No Cloud Server menu? Older machines can’t push; use <Link href="/hr/attendance?import=1" className="underline">Import from device</Link> with the USB file instead. The machine’s clock must be right (Menu → Date/Time).</p>
        </Card>
      </div>
    </>
  );
}
