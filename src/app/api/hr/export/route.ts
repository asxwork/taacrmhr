import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { HR_REPORTS, hrTable, type HrReport } from "@/lib/hr-report-tables";
import { toCsv } from "@/lib/payroll-reports";

/** CSV of an HR report: /api/hr/export?type=employees&from=…&to=… */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "reports.hr")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as HrReport;
  if (!HR_REPORTS.some((t) => t.value === type)) return new Response("Bad request", { status: 400 });
  const from = new Date(`${url.searchParams.get("from") ?? "2000-01-01"}T00:00:00`);
  const to = new Date(`${url.searchParams.get("to") ?? "2100-01-01"}T00:00:00`);
  const { head, rows } = await hrTable(type, from, to, (await employeeWhere(user)) ?? { id: "none" });
  return new Response("﻿" + toCsv(head, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hr-${type}.csv"` } });
}
