import { notFound } from "next/navigation";
import { Download, FileUp, Plus, RefreshCw, Sparkles, Upload, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { autoMapUsers, mapMachineUser, syncMachineUsers, unmapMachineUser, uploadMachineLogs, uploadMapping } from "../actions";

export const metadata = { title: "Machine user mapping" };

/** Machines → Change mapping: which machine user is which employee (ResourceInn "Employee mappings to machine users"). */
export default async function MachineMappingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("hr.attendance");
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.attendance", "edit") === "all";
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const m = await db.attendanceMachine.findUnique({ where: { id } });
  if (!m) notFound();
  const [users, employees, logCounts] = await Promise.all([
    db.machineUser.findMany({ where: { machineId: id } }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }),
    db.machineLog.groupBy({ by: ["deviceUserId"], where: { machineId: id }, _count: true }),
  ]);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const punches = new Map(logCounts.map((c) => [c.deviceUserId, c._count]));
  const label = (u: (typeof users)[number]) => `${u.name || "No name"} - ${u.deviceUserId}`;
  const byNum = (a: (typeof users)[number], b: (typeof users)[number]) => (Number(a.deviceUserId) || 0) - (Number(b.deviceUserId) || 0) || a.deviceUserId.localeCompare(b.deviceUserId);
  const q = (sp.q ?? "").trim().toLowerCase();
  const mapped = users.filter((u) => u.employeeId && empById.has(u.employeeId)).sort((a, b) => (empById.get(a.employeeId!)!.fullName).localeCompare(empById.get(b.employeeId!)!.fullName))
    .filter((u) => !q || `${empById.get(u.employeeId!)!.fullName} ${label(u)}`.toLowerCase().includes(q));
  const unmapped = users.filter((u) => !u.employeeId || !empById.has(u.employeeId)).sort(byNum);
  const mappedEmp = new Set(users.map((u) => u.employeeId).filter(Boolean));
  const total = users.length;
  const done = users.length - unmapped.length;
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium";

  return (
    <>
      <PageHeader title="Employee mappings to machine users" description={`${m.name ?? m.serial} · map each person on the machine to their AMS employee once; their punches then count for that employee.`} />

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/attendance/machine-mapping?machine=${id}`} className={`${btn} border border-line hover:bg-canvas`}><Download className="size-4" /> Download sample</a>
          {canEdit && (
            <>
              <details className="relative">
                <summary className={`${btn} cursor-pointer list-none border border-line hover:bg-canvas`}><Upload className="size-4" /> Upload mapping</summary>
                <div className="absolute left-0 z-20 mt-2 w-80 rounded-xl border border-line bg-surface p-4 shadow-xl">
                  <ActionForm action={uploadMapping} className="space-y-3"><input type="hidden" name="machineId" value={id} />
                    <p className="text-xs text-muted">CSV with <b>employee_code</b> and <b>machine_user_id</b> (the sample has the machine&apos;s users ready; fill in the codes).</p>
                    <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
                    <SubmitButton className="h-9 w-full">Upload</SubmitButton>
                  </ActionForm>
                </div>
              </details>
              <details className="relative">
                <summary className={`${btn} cursor-pointer list-none border border-line hover:bg-canvas`}><FileUp className="size-4" /> Machine logs upload</summary>
                <div className="absolute left-0 z-20 mt-2 w-80 rounded-xl border border-line bg-surface p-4 shadow-xl">
                  <ActionForm action={uploadMachineLogs} className="space-y-3"><input type="hidden" name="machineId" value={id} />
                    <p className="text-xs text-muted">The attendance log file from the machine&apos;s USB download (attlog.dat / .txt). Punches of mapped users go into attendance; the rest wait in Logs until mapped.</p>
                    <input type="file" name="file" accept=".dat,.txt,.csv" required className="block w-full text-sm" />
                    <SubmitButton className="h-9 w-full">Upload logs</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            </>
          )}
        </div>
        <div className="mt-4 flex items-baseline justify-between text-sm">
          <span>Machine: <b>{m.name ?? m.serial}</b></span>
          <span>Users mapped: <b className="tabular-nums">{done}/{total}</b></span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-gold-600 transition-[width]" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>

        {canEdit && (
          <div className="mt-5 flex flex-wrap items-start gap-2 rounded-xl bg-canvas/60 p-3">
            <ActionForm action={mapMachineUser} className="flex min-w-0 flex-1 flex-wrap gap-2"><input type="hidden" name="machineId" value={id} />
              <select name="employeeId" required defaultValue="" className="input h-9 min-w-48 flex-1" aria-label="Select employee">
                <option value="" disabled>Select employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} · {e.code}{mappedEmp.has(e.id) ? " (mapped)" : ""}</option>)}
              </select>
              <select name="machineUserId" required defaultValue="" className="input h-9 min-w-48 flex-1" aria-label="Select machine user">
                <option value="" disabled>Select machine user</option>
                {[...users].sort(byNum).map((u) => <option key={u.id} value={u.id}>{label(u)}{u.employeeId ? " (mapped)" : ""}</option>)}
              </select>
              <SubmitButton className="h-9"><Plus className="size-4" /> Add</SubmitButton>
            </ActionForm>
            {m.mode === "pull" && <ActionForm action={syncMachineUsers}><input type="hidden" name="machineId" value={id} /><SubmitButton className="h-9" variant="secondary"><RefreshCw className="size-4" /> Sync users</SubmitButton></ActionForm>}
            <ActionForm action={autoMapUsers}><input type="hidden" name="machineId" value={id} /><SubmitButton className="h-9" variant="secondary"><Sparkles className="size-4" /> Auto-map employees</SubmitButton></ActionForm>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="overflow-hidden">
          <form className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-sm font-semibold">Mapped ({done})</h2>
            <input name="q" defaultValue={sp.q} placeholder="Search name" className="input h-9 w-56" aria-label="Search mappings" />
          </form>
          {mapped.length === 0 ? <EmptyState title={done ? "No match" : "Nobody mapped yet"} description={done ? "Try another search." : total ? "Use Auto-map, pick pairs above, or upload the sample CSV." : "Click Sync users to read the people on the machine, or upload its log file."} /> : (
            <table className="w-full text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="w-14 px-4 py-2.5">Sr.</th><th className="px-4 py-2.5">Employee name</th><th className="px-4 py-2.5">Machine username</th><th className="px-4 py-2.5 text-right">Punches</th><th className="w-16 px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-line">
                {mapped.map((u, i) => {
                  const e = empById.get(u.employeeId!)!;
                  return (
                    <tr key={u.id} className="hover:bg-canvas/40">
                      <td className="px-4 py-2.5 text-muted tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5"><span className="font-medium">{e.fullName}</span> <span className="text-xs text-muted">{e.code}</span></td>
                      <td className="px-4 py-2.5">{label(u)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">{punches.get(u.deviceUserId) ?? 0}</td>
                      <td className="px-4 py-2 text-right">{canEdit && <form action={unmapMachineUser}><input type="hidden" name="id" value={u.id} /><button title="Remove mapping" aria-label={`Remove mapping for ${e.fullName}`} className="rounded-full p-1 text-red-500 hover:bg-red-50"><XCircle className="size-5" /></button></form>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="h-fit overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Not mapped yet ({unmapped.length})</h2>
          {unmapped.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">{total ? "Everyone on this machine is mapped." : "No machine users yet."}</p> : (
            <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
              {unmapped.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">{label(u)}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{punches.get(u.deviceUserId) ?? 0} punches</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
