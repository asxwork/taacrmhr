import Link from "@/components/link";
import { differenceInSeconds, format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { MachineTabs } from "../machine-tabs";

export const metadata = { title: "Machine fetch history" };
export const dynamic = "force-dynamic";
const PAGE = 50;

/** Machines → Fetch history: every attempt to read a machine (every 10 minutes by cron, or Fetch now), like ResourceInn. */
export default async function MachineFetchesPage({ searchParams }: { searchParams: Promise<{ machine?: string; page?: string; errors?: string }> }) {
  await requirePermission("hr.attendance");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const machines = await db.attendanceMachine.findMany({ select: { id: true, name: true, serial: true }, orderBy: { name: "asc" } });
  const where = { ...(sp.machine ? { machineId: sp.machine } : {}), ...(sp.errors === "1" ? { error: { not: null } } : {}) };
  const [rows, total] = await Promise.all([
    db.machineFetch.findMany({ where, orderBy: { startedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.machineFetch.count({ where }),
  ]);
  const name = new Map(machines.map((m) => [m.id, m.name ?? m.serial]));
  const q = (p: Record<string, string | number | undefined>) => `?${new URLSearchParams(Object.entries({ machine: sp.machine, errors: sp.errors, ...p }).filter(([, v]) => v !== undefined && v !== "") as [string, string][])}`;

  return (
    <>
      <MachineTabs active="fetches" />
      <PageHeader title="Fetch history" description="Every time AMS tried to read a machine: automatically every 10 minutes (cron) or when someone clicked Fetch now. Read = punches on the machine, Saved = new in Logs, Added = new in attendance." />
      <AutoFilterForm className="mb-4 flex flex-wrap items-center gap-2">
        <select name="machine" defaultValue={sp.machine ?? ""} className="input h-9 w-48" aria-label="Machine"><option value="">All machines</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.serial}</option>)}</select>
        <select name="errors" defaultValue={sp.errors ?? ""} className="input h-9 w-40" aria-label="Result"><option value="">All results</option><option value="1">Errors only</option></select>
      </AutoFilterForm>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="No fetches yet" description="The machines cron job (every 10 minutes) or Fetch now on a machine adds a row here each time." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr>{["Machine", "By", "Start", "Took", "Read", "Saved", "Added", "Result"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-canvas/40">
                    <td className="px-4 py-2.5 font-medium">{name.get(r.machineId) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{r.trigger === "cron" ? "Auto" : "Fetch now"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{format(r.startedAt, "MMM d, yyyy h:mm a")}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted">{r.endedAt ? `${differenceInSeconds(r.endedAt, r.startedAt)}s` : "running / cut off"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.read.toLocaleString()}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.saved.toLocaleString()}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.added.toLocaleString()}</td>
                    <td className="max-w-md px-4 py-2.5">{r.error ? <span className="text-xs text-red-700">{r.error}</span> : r.endedAt ? <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", "bg-emerald-100 text-emerald-800")}>OK</span> : <span className="text-xs text-amber-700">Didn&apos;t finish (the server stopped it, e.g. a timeout)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-2.5 text-sm text-muted">
            <span>{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total.toLocaleString()}</span>
            {page > 1 && <Link href={`/hr/attendance/machines/fetches${q({ page: page - 1 })}`} className="rounded border border-line px-2 py-1 hover:bg-canvas">Previous</Link>}
            {page * PAGE < total && <Link href={`/hr/attendance/machines/fetches${q({ page: page + 1 })}`} className="rounded border border-line px-2 py-1 hover:bg-canvas">Next</Link>}
          </div>
        )}
      </Card>
    </>
  );
}
