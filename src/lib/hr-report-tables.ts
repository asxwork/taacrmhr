// HR → Reports → Generate Reports: employee, probation, travel, expense and loan reports as tables (page + CSV).
import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { attendanceReport } from "./attendance-reports";

export const HR_REPORTS = [
  { value: "employees", label: "Employee Reports", dated: false },
  { value: "probation", label: "Employee Probation Reports", dated: false },
  { value: "travel", label: "Travel Reports", dated: true },
  { value: "expenses", label: "Expense Reports", dated: true },
  { value: "loans", label: "Loan & Advances Reports", dated: false },
] as const;
export type HrReport = (typeof HR_REPORTS)[number]["value"];

const d = (v: Date | null | undefined) => (v ? format(v, "yyyy-MM-dd") : "");

export async function hrTable(type: HrReport, from: Date, to: Date, scope: Prisma.EmployeeWhereInput): Promise<{ head: string[]; rows: (string | number)[][] }> {
  switch (type) {
    case "employees": {
      const rows = await db.employee.findMany({ where: { ...scope, status: { not: "left" } }, include: { department: true, designation: true, branch: true, manager: true }, orderBy: { code: "asc" } });
      return {
        head: ["Code", "Name", "Department", "Designation", "Branch", "Line manager", "Joined", "Status", "Type", "Gender", "D.O.B", "CNIC", "Mobile", "Email", "Blood group"],
        rows: rows.map((e) => [e.code, e.fullName, e.department?.name ?? "", e.designation?.name ?? "", e.branch?.name ?? "", e.manager?.fullName ?? "", d(e.joiningDate), e.status, e.employmentType, e.gender ?? "", d(e.dob), e.cnic ?? "", e.phone ?? "", e.officialEmail ?? e.personalEmail ?? "", e.bloodGroup ?? ""]),
      };
    }
    case "probation": {
      const rows = await db.employee.findMany({ where: { ...scope, OR: [{ status: "probation" }, { probationReviews: { some: {} } }] }, include: { designation: true, manager: true, probationReviews: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { probationEnd: "asc" } });
      return {
        head: ["Code", "Name", "Designation", "Line manager", "Joined", "Probation ends", "Status", "Review score", "Recommendation", "Decision"],
        rows: rows.map((e) => { const r = e.probationReviews[0]; return [e.code, e.fullName, e.designation?.name ?? "", e.manager?.fullName ?? "", d(e.joiningDate), d(e.probationEnd), e.status, r ? Number(r.overall.toFixed(1)) : "", r?.recommendation ?? "", r?.decision ?? ""]; }),
      };
    }
    case "travel":
      return attendanceReport("travel", from, to, scope);
    case "expenses": {
      const rows = await db.expense.findMany({ where: { employee: scope, date: { gte: from, lte: to } }, include: { employee: { select: { code: true, fullName: true } } }, orderBy: { date: "desc" } });
      const total = rows.filter((x) => x.status !== "rejected" && x.status !== "cancelled").reduce((s, x) => s + x.amount, 0);
      return {
        head: ["Date", "Code", "Employee", "Category", "Description", "Amount", "Status"],
        rows: [...rows.map((x) => [d(x.date), x.employee.code, x.employee.fullName, x.category, x.description ?? "", Math.round(x.amount), x.status]), ["Total", "", "", "", "excluding rejected", Math.round(total), ""]],
      };
    }
    case "loans": {
      const rows = await db.loan.findMany({ where: { employee: scope, status: { in: ["active", "closed", "pending"] } }, include: { employee: { select: { code: true, fullName: true } }, repayments: true }, orderBy: { createdAt: "desc" } });
      return {
        head: ["Code", "Employee", "Type", "Amount", "Installment", "Repaid", "Outstanding", "From month", "Status"],
        rows: rows.map((l) => { const repaid = l.repayments.reduce((s, r) => s + r.amount, 0); return [l.employee.code, l.employee.fullName, l.kind, Math.round(l.amount), Math.round(l.installment), Math.round(repaid), Math.round(Math.max(0, l.amount - repaid)), l.startMonth, l.status]; }),
      };
    }
  }
}
