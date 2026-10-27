import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { payrollEmployeeWhere } from "@/lib/payroll";
import { REPORT_TYPES, reportTable, toCsv, type ReportType } from "@/lib/payroll-reports";

/** CSV download of a payroll report or bank voucher: /api/payroll/export?type=voucher&month=2026-10 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.payroll")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as ReportType;
  const month = url.searchParams.get("month") ?? "";
  if (!REPORT_TYPES.some((t) => t.value === type) || !/^\d{4}-\d{2}$/.test(month)) return new Response("Bad request", { status: 400 });
  const scope = (await payrollEmployeeWhere(user)) ?? { id: "none" };
  const { head, rows } = await reportTable(type, month, scope);
  return new Response("﻿" + toCsv(head, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${type}-${month}.csv"` },
  });
}
