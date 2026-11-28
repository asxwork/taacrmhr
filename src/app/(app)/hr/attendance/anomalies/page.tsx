import Link from "@/components/link";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { attendanceEmployeeWhere } from "@/lib/attendance";
import { attendanceAnomalies } from "@/lib/attendance-anomalies";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";

export const metadata = { title: "Attendance anomalies" };

/** Patterns worth a word with the employee, found in recent attendance. */
export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const days = [14, 30, 60, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const scope = (await attendanceEmployeeWhere(user))!;
  const emps = await db.employee.findMany({ where: { ...scope, status: { not: "left" } }, select: { id: true, fullName: true, code: true, photo: true }, orderBy: { fullName: "asc" } });
  const rows = await attendanceAnomalies(emps, days);
  return (
    <>
      <PageHeader title="Attendance anomalies" description="Patterns from the attendance records worth a word with the employee: late streaks, forgotten check-outs, absences next to off days, check-ins away from the office and very long days." />
      <div className="mb-4 flex gap-1 text-sm">
        {[14, 30, 60, 90].map((n) => <Link key={n} href={`/hr/attendance/anomalies?days=${n}`} className={cn("rounded-lg px-3 py-1.5", n === days ? "bg-navy-900 text-white" : "border border-line hover:bg-canvas")}>Last {n} days</Link>)}
      </div>
      {rows.length === 0 ? <EmptyState title="Nothing unusual" description={`No attendance patterns found in the last ${days} days.`} /> : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map(({ e, list }) => (
            <Card key={e.id} className="p-4">
              <div className="mb-2 flex items-center gap-3">
                <PersonAvatar name={e.fullName} photo={e.photo} />
                <Link href={`/hr/employees/${e.id}?tab=attendance`} className="font-medium hover:underline">{e.fullName}</Link>
                {e.code && <span className="text-xs text-muted">{e.code}</span>}
              </div>
              <ul className="space-y-1.5">
                {list.map((a) => (
                  <li key={a.kind} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", a.level === "high" ? "text-red-600" : "text-amber-600")} />
                    <span><b className="font-medium">{a.label}</b><span className="block text-xs text-muted">{a.detail}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
