// Payroll report rows shared by the Vouchers / Reports pages and their CSV export (/api/payroll/export).
import { db } from "./db";
import { payrollSettings } from "./payroll";

export const REPORT_TYPES = [
  { value: "summary", label: "Department summary" },
  { value: "register", label: "Salary register" },
  { value: "tax", label: "Income tax deductions" },
  { value: "eobi", label: "EOBI contributions" },
  { value: "voucher", label: "Bank transfer voucher" },
] as const;
export type ReportType = (typeof REPORT_TYPES)[number]["value"];

export async function payslipsFor(month: string, scope: object = {}) {
  return db.payslip.findMany({
    where: { run: { month }, employee: scope },
    include: { employee: { select: { fullName: true, code: true, cnic: true, salary: { select: { paymentMethod: true } } } }, lines: true },
    orderBy: { employee: { fullName: "asc" } },
  });
}

/** Header + rows for a report type (numbers rounded to rupees). */
export async function reportTable(type: ReportType, month: string, scope: object = {}): Promise<{ head: string[]; rows: (string | number)[][] }> {
  const slips = await payslipsFor(month, scope);
  const r = (n: number) => Math.round(n);
  switch (type) {
    case "summary": {
      const map = new Map<string, { n: number; gross: number; ded: number; tax: number; net: number }>();
      for (const s of slips) {
        const k = s.department ?? "Not set";
        const cur = map.get(k) ?? { n: 0, gross: 0, ded: 0, tax: 0, net: 0 };
        map.set(k, { n: cur.n + 1, gross: cur.gross + s.gross, ded: cur.ded + s.deductions, tax: cur.tax + s.tax, net: cur.net + s.net });
      }
      const rows = [...map.entries()].sort().map(([k, v]) => [k, v.n, r(v.gross), r(v.ded), r(v.tax), r(v.net)]);
      const t = [...map.values()].reduce((a, v) => ({ n: a.n + v.n, gross: a.gross + v.gross, ded: a.ded + v.ded, tax: a.tax + v.tax, net: a.net + v.net }), { n: 0, gross: 0, ded: 0, tax: 0, net: 0 });
      return { head: ["Department", "Employees", "Gross", "Deductions", "Tax", "Net"], rows: [...rows, ["Total", t.n, r(t.gross), r(t.ded), r(t.tax), r(t.net)]] };
    }
    case "register":
      return {
        head: ["Code", "Employee", "Department", "Designation", "Gross", "Earnings", "Deductions", "Tax", "Net", "Absent days", "Late"],
        rows: slips.map((s) => [s.employee.code, s.employee.fullName, s.department ?? "", s.designation ?? "", r(s.gross), r(s.earnings), r(s.deductions), r(s.tax), r(s.net), s.absentDays, s.lateCount]),
      };
    case "tax":
      return { head: ["Code", "Employee", "CNIC", "Taxable gross", "Tax deducted"], rows: slips.filter((s) => s.tax > 0).map((s) => [s.employee.code, s.employee.fullName, s.employee.cnic ?? "", r(s.earnings), r(s.tax)]) };
    case "eobi": {
      const { eobiEmployer } = await payrollSettings();
      const rows = slips.flatMap((s) => {
        const emp = s.lines.find((l) => l.source === "eobi");
        return emp ? [[s.employee.code, s.employee.fullName, s.employee.cnic ?? "", r(emp.amount), eobiEmployer, r(emp.amount) + eobiEmployer]] : [];
      });
      return { head: ["Code", "Employee", "CNIC", "Employee share", "Employer share", "Total"], rows };
    }
    case "voucher":
      return {
        head: ["Code", "Employee", "Payment method", "Bank", "Account title", "Account / IBAN", "Net pay"],
        rows: slips.map((s) => [s.employee.code, s.employee.fullName, s.employee.salary?.paymentMethod ?? "bank", s.bankName ?? "", s.accountTitle ?? "", s.accountNumber ?? "", r(s.net)]),
      };
  }
}

export const toCsv = (head: string[], rows: (string | number)[][]) =>
  [head, ...rows].map((row) => row.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");
