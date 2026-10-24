import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { payrollEmployeeWhere } from "@/lib/payroll";
import { toCsv } from "@/lib/reports";

/** /api/export/payroll?month=2026-10&type=bank|register */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "hr.payroll", "export")) return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") ?? "";
  const type = sp.get("type") === "register" ? "register" : "bank";
  const run = await db.payrollRun.findUnique({ where: { month } });
  if (!run) return new Response("Not found", { status: 404 });
  const scope = (await payrollEmployeeWhere(user, "export"))!;
  const slips = await db.payslip.findMany({ where: { runId: run.id, employee: scope }, include: { employee: true, lines: { orderBy: { sortOrder: "asc" } } }, orderBy: { employee: { fullName: "asc" } } });

  let rows: (string | number | null)[][];
  if (type === "bank") {
    rows = [["Employee code", "Name", "Account title", "Bank", "Account / IBAN", "Net pay"], ...slips.map((p) => [p.employee.code, p.employee.fullName, p.accountTitle, p.bankName, p.accountNumber, Math.round(p.net)])];
  } else {
    const labels = [...new Set(slips.flatMap((p) => p.lines.map((l) => `${l.kind === "earning" ? "+" : "-"} ${l.label.replace(/ \(.*\)$/, "")}`)))];
    rows = [
      ["Employee code", "Name", "Designation", "Days", "Absent", "Late", ...labels, "Earnings", "Deductions", "Tax", "Net"],
      ...slips.map((p) => {
        const by = (label: string) => p.lines.filter((l) => `${l.kind === "earning" ? "+" : "-"} ${l.label.replace(/ \(.*\)$/, "")}` === label).reduce((s, l) => s + l.amount, 0);
        return [p.employee.code, p.employee.fullName, p.designation, p.employedDays, p.absentDays, p.lateCount, ...labels.map((l) => Math.round(by(l)) || ""), Math.round(p.earnings), Math.round(p.deductions), Math.round(p.tax), Math.round(p.net)];
      }),
    ];
  }
  await audit(user.id, "export", "payroll", run.id, `Exported payroll ${month} (${type})`);
  return new Response("\uFEFF" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${month}-${type}.csv"`, "Cache-Control": "no-store" },
  });
}
