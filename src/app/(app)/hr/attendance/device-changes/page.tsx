import Link from "next/link";
import { format } from "date-fns";
import { Smartphone, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { attendanceEmployeeWhere } from "@/lib/attendance";
import { deviceLockOn } from "@/lib/devices";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { removeDevice, setDeviceLock } from "./actions";

export const metadata = { title: "Device Change Approvals" };
const TONE = { approved: "green", pending: "amber", rejected: "red", replaced: "neutral" } as const;

/** Attendance → Device Change Approvals: lock web check-in to each employee's device; new devices need HR approval. */
export default async function DeviceChangesPage() {
  const user = await requirePermission("hr.attendance");
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.attendance", "edit") === "all";
  const scope = (await attendanceEmployeeWhere(user))!;
  const [on, devices] = await Promise.all([
    deviceLockOn(),
    db.checkinDevice.findMany({ where: { employee: scope }, include: { employee: { select: { id: true, fullName: true, code: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
  ]);
  const pending = devices.filter((d) => d.status === "pending");

  return (
    <>
      <PageHeader title="Device Change Approvals" description="With the device lock on, each employee checks in from one registered phone or computer. Their first device is registered automatically; a new one waits for HR approval here and in Approvals." />
      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <Smartphone className="size-6 text-navy-700" />
        <div className="flex-1">
          <p className="font-medium">Device lock is {on ? "on" : "off"}</p>
          <p className="text-sm text-muted">{on ? "Check-in from an unregistered device is blocked until HR approves it." : "Anyone can check in from any device (location rules still apply)."}</p>
        </div>
        {canEdit && <form action={setDeviceLock}>{!on && <input type="hidden" name="on" value="on" />}<Button variant={on ? "secondary" : "primary"}>{on ? "Turn off" : "Turn on"}</Button></form>}
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Waiting for approval ({pending.length})</h2>
      <Card className="mb-6">
        {pending.length === 0 ? <EmptyState title="No device changes waiting" /> : (
          <ul className="divide-y divide-line">
            {pending.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1"><b>{d.employee.fullName}</b> <span className="text-muted">wants to use</span> {d.label} <span className="text-xs text-muted">· {format(d.createdAt, "d MMM, h:mm a")}</span></span>
                {d.approvalId && <Link href={`/approvals?open=${d.approvalId}`} className="rounded-md bg-navy-900 px-3 py-1.5 text-xs font-medium text-white">Review</Link>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Registered devices</h2>
      <Card className="overflow-x-auto">
        {devices.filter((d) => d.status !== "pending").length === 0 ? <EmptyState title="No devices registered yet" description="Devices register on first check-in once the lock is on." /> : (
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Device</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Last check-in</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {devices.filter((d) => d.status !== "pending").map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2.5"><Link href={`/hr/employees/${d.employee.id}`} className="font-medium hover:underline">{d.employee.fullName}</Link> <span className="text-xs text-muted">{d.employee.code}</span></td>
                  <td className="px-4 py-2.5">{d.label}</td>
                  <td className="px-4 py-2.5"><Badge tone={TONE[d.status as keyof typeof TONE] ?? "neutral"}>{d.status}</Badge></td>
                  <td className="px-4 py-2.5 text-xs text-muted">{d.lastUsedAt ? format(d.lastUsedAt, "d MMM, h:mm a") : "—"}</td>
                  <td className="px-4 py-2.5 text-right">{canEdit && <form action={removeDevice}><input type="hidden" name="id" value={d.id} /><button aria-label="Remove device" title="Remove" className="p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
