import Link from "@/components/link";
import { format, startOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { machineEmployeeMap } from "@/lib/machine-users";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { MachineTabs } from "../machine-tabs";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { syncMachineNow } from "../actions";

export const metadata = { title: "Machine logs" };
const PAGE = 200;
export const dynamic = "force-dynamic";

/** Machines → Logs: every punch read from the machines (like ResourceInn's Logs), with who it belongs to in AMS. */
export default async function MachineLogsPage({ searchParams }: { searchParams: Promise<{ machine?: string; from?: string; to?: string; show?: string; page?: string }> }) {
  await requirePermission("hr.attendance");
  const sp = await searchParams;
  // No dates chosen = all dates (old machine logs must show without hunting for them).
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const machines = await db.attendanceMachine.findMany({ select: { id: true, name: true, serial: true, mode: true, status: true, lastError: true, lastSyncAt: true, lastSeenAt: true, info: true }, orderBy: { name: "asc" } });
  const where: Prisma.MachineLogWhereInput = {
    ...(from || to ? { at: { ...(from ? { gte: startOfDay(new Date(`${from}T00:00:00`)) } : {}), ...(to ? { lt: new Date(startOfDay(new Date(`${to}T00:00:00`)).getTime() + 86_400_000) } : {}) } } : {}),
    ...(sp.machine ? { machineId: sp.machine } : {}),
  };
  const perMachine = new Map((await db.machineLog.groupBy({ by: ["machineId"], _count: true })).map((g) => [g.machineId, g._count]));
  const [all, total] = await Promise.all([db.machineLog.findMany({ where, orderBy: { at: "desc" }, take: 5000 }), db.machineLog.count({ where })]);
  // Who each punch belongs to, per machine.
  const owner = new Map<string, string>();
  for (const mid of [...new Set(all.map((l) => l.machineId))]) {
    const map = await machineEmployeeMap(mid, [...new Set(all.filter((l) => l.machineId === mid).map((l) => l.deviceUserId))]);
    for (const [dev, emp] of map) owner.set(`${mid}|${dev}`, emp);
  }
  const [emps, mUsers] = await Promise.all([
    db.employee.findMany({ where: { id: { in: [...new Set(owner.values())] } }, select: { id: true, fullName: true, code: true } }),
    db.machineUser.findMany({ where: { machineId: { in: [...new Set(all.map((l) => l.machineId))] } }, select: { machineId: true, deviceUserId: true, name: true } }),
  ]);
  const empBy = new Map(emps.map((e) => [e.id, e]));
  const nameBy = new Map(mUsers.map((u) => [`${u.machineId}|${u.deviceUserId}`, u.name]));
  const machineBy = new Map(machines.map((m) => [m.id, m.name ?? m.serial]));
  const show = sp.show === "mapped" || sp.show === "unmapped" ? sp.show : "all";
  const filtered = all.filter((l) => show === "all" || (show === "mapped") === owner.has(`${l.machineId}|${l.deviceUserId}`));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const unmappedCount = all.filter((l) => !owner.has(`${l.machineId}|${l.deviceUserId}`)).length;
  const q = (p: Record<string, string | number | undefined>) => `?${new URLSearchParams(Object.entries({ machine: sp.machine, from, to, show: show === "all" ? undefined : show, ...p }).filter(([, v]) => v !== undefined && v !== "") as [string, string][])}`;

  return (
    <>
      <MachineTabs active="logs" />
      <PageHeader title="Logs" description={`Every punch read from the machines${total > all.length ? ` (latest ${all.length.toLocaleString()} of ${total.toLocaleString()} shown)` : ""}. Punches of users not mapped yet wait here and count as soon as they are mapped.`} />
      {/* Each machine: was it read, how many punches are saved here, or why not. */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {machines.filter((m) => m.status !== "blocked").map((m) => {
          const saved = perMachine.get(m.id) ?? 0;
          const failing = m.mode === "pull" && !!m.lastError;
          return (
            <Card key={m.id} className={cn("flex items-start gap-3 p-4", failing && "border-red-200")}>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{m.name ?? m.serial} <span className="text-xs font-normal text-muted">{saved.toLocaleString()} punch(es) saved in Logs</span></p>
                {failing ? <p className="mt-1 text-xs text-red-700">Last fetch {m.lastSyncAt ? formatDistanceToNow(m.lastSyncAt, { addSuffix: true }) : ""} failed: {m.lastError}</p>
                  : m.lastSeenAt ? <p className="mt-1 text-xs text-emerald-700">Read {formatDistanceToNow(m.lastSeenAt, { addSuffix: true })}{m.info ? ` · ${m.info}` : ""}</p>
                  : <p className="mt-1 text-xs text-muted">Never read yet. Click Fetch now.</p>}
              </div>
              {m.mode === "pull" && m.status === "approved" && <ActionForm action={syncMachineNow}><input type="hidden" name="id" value={m.id} /><SubmitButton className="h-9" variant="secondary"><RefreshCw className="size-4" /> Fetch now</SubmitButton></ActionForm>}
            </Card>
          );
        })}
      </div>
      <AutoFilterForm className="mb-4 flex flex-wrap gap-2">
        <select name="machine" defaultValue={sp.machine ?? ""} className="input h-9 w-48" aria-label="Machine"><option value="">All machines</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.serial}</option>)}</select>
        <input type="date" name="from" defaultValue={from} className="input h-9 w-40" aria-label="From (empty = all dates)" title="Empty = all dates" />
        <input type="date" name="to" defaultValue={to} className="input h-9 w-40" aria-label="To" />
        {show !== "all" && <input type="hidden" name="show" value={show} />}
      </AutoFilterForm>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-3">
          {([["all", "All", all.length], ["mapped", "Mapped", all.length - unmappedCount], ["unmapped", "Not mapped", unmappedCount]] as const).map(([k, l, n]) => (
            <Link key={k} href={`/hr/attendance/machines/logs${q({ show: k === "all" ? undefined : k, page: undefined })}`} className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm", show === k ? "border-navy-900 font-medium" : "border-transparent text-muted hover:text-ink")}>
              <span className={cn("rounded-md px-1.5 text-xs font-semibold tabular-nums", k === "unmapped" && n ? "bg-amber-100 text-amber-800" : "bg-canvas")}>{n.toLocaleString()}</span>{l}
            </Link>
          ))}
        </div>
        {rows.length === 0 ? <EmptyState title="No machine logs in this period" description={machines.length ? "Logs arrive when a machine is fetched (Machines → Fetch logs now, or every 10 minutes), or upload the machine's log file on its mapping page." : "Add a machine first."} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr>{["Date", "Time", "Machine", "Machine user", "Employee"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((l) => {
                  const emp = empBy.get(owner.get(`${l.machineId}|${l.deviceUserId}`) ?? "");
                  return (
                    <tr key={l.id} className="hover:bg-canvas/40">
                      <td className="whitespace-nowrap px-4 py-2">{format(l.at, "EEE d MMM yyyy")}</td>
                      <td className="px-4 py-2 tabular-nums">{format(l.at, "h:mm:ss a")}</td>
                      <td className="px-4 py-2">{machineBy.get(l.machineId) ?? "—"}</td>
                      <td className="px-4 py-2">{nameBy.get(`${l.machineId}|${l.deviceUserId}`) || "—"} <span className="text-xs text-muted">#{l.deviceUserId}</span></td>
                      <td className="px-4 py-2">{emp ? <span>{emp.fullName} <span className="text-xs text-muted">{emp.code}</span></span> : <Link href={`/hr/attendance/machines/${l.machineId}`} className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:underline">Not mapped · map</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > PAGE && (
          <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-2.5 text-sm text-muted">
            <span>{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, filtered.length)} of {filtered.length.toLocaleString()}</span>
            {page > 1 && <Link href={`/hr/attendance/machines/logs${q({ page: page - 1 })}`} className="rounded border border-line px-2 py-1 hover:bg-canvas">Previous</Link>}
            {page * PAGE < filtered.length && <Link href={`/hr/attendance/machines/logs${q({ page: page + 1 })}`} className="rounded border border-line px-2 py-1 hover:bg-canvas">Next</Link>}
          </div>
        )}
      </Card>
    </>
  );
}
