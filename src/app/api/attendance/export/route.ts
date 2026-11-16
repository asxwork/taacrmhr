import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { attendanceEmployeeWhere } from "@/lib/attendance";
import { ATT_REPORTS, attendanceReport, type AttReport } from "@/lib/attendance-reports";
import { toCsv } from "@/lib/payroll-reports";
import { cellText, readFilters, runTemplate, templateByKey } from "@/lib/attendance-templates";

/** CSV of an attendance report: /api/attendance/export?type=time&from=2026-10-01&to=2026-10-31 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.attendance")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as AttReport;
  // Ready-made templates (Attendance → Reports): same filters as the page.
  const tpl = templateByKey(type);
  if (tpl) {
    const out = await runTemplate(tpl.key, readFilters(Object.fromEntries(url.searchParams)), (await attendanceEmployeeWhere(user)) ?? { id: "none" });
    return new Response("\uFEFF" + toCsv(out.head, out.rows.map((r) => r.map(cellText))), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tpl.key}-${url.searchParams.get("from") ?? url.searchParams.get("period") ?? "report"}.csv"` } });
  }
  const from = new Date(`${url.searchParams.get("from")}T00:00:00`);
  const to = new Date(`${url.searchParams.get("to")}T00:00:00`);
  if (!ATT_REPORTS.some((t) => t.value === type) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return new Response("Bad request", { status: 400 });
  const { head, rows } = await attendanceReport(type, from, to, (await attendanceEmployeeWhere(user)) ?? { id: "none" });
  return new Response("﻿" + toCsv(head, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-${type}-${url.searchParams.get("from")}.csv"` } });
}
