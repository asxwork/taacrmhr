import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { attendanceEmployeeWhere } from "@/lib/attendance";
import { ATT_REPORTS, attendanceReport, type AttReport } from "@/lib/attendance-reports";
import { toCsv } from "@/lib/payroll-reports";

/** CSV of an attendance report: /api/attendance/export?type=time&from=2026-10-01&to=2026-10-31 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.attendance")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as AttReport;
  const from = new Date(`${url.searchParams.get("from")}T00:00:00`);
  const to = new Date(`${url.searchParams.get("to")}T00:00:00`);
  if (!ATT_REPORTS.some((t) => t.value === type) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return new Response("Bad request", { status: 400 });
  const { head, rows } = await attendanceReport(type, from, to, (await attendanceEmployeeWhere(user)) ?? { id: "none" });
  return new Response("﻿" + toCsv(head, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-${type}-${url.searchParams.get("from")}.csv"` } });
}
