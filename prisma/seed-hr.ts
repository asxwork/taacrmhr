import type { PrismaClient } from "@prisma/client";
import { REQUEST_TYPES } from "../src/lib/request-types";

/** Departments, designations, approval flows and checklist templates. Sample employees live in src/lib/demo-data.ts. */
export async function seedHr(db: PrismaClient) {
  const departments = ["Management", "Sales", "HR & Admin", "Finance", "Marketing", "Operations"];
  for (const [i, name] of departments.entries()) await db.department.upsert({ where: { name }, update: {}, create: { name, sortOrder: i } });

  const designations: [string, string][] = [
    ["Chief Executive", "E1"], ["Sales Manager", "M2"], ["Property Consultant", "S1"], ["HR Manager", "M2"],
    ["Office Assistant", "A1"], ["Accountant", "S2"], ["Marketing Executive", "S1"], ["Administrator", "M1"],
  ];
  for (const [name, grade] of designations) await db.designation.upsert({ where: { name }, update: {}, create: { name, grade } });

  const flows: [string, string, object[]][] = [
    ["profile_update", "Profile update", [{ kind: "hr" }]],
    ["document", "Document upload", [{ kind: "hr" }]],
    ["leave", "Leave", [{ kind: "manager" }, { kind: "hr" }]],
    ["attendance_correction", "Attendance correction", [{ kind: "manager" }]],
    ["loan", "Loan / advance", [{ kind: "manager" }, { kind: "hr" }]],
    ["expense", "Expense claim", [{ kind: "manager" }, { kind: "hr" }]],
    ["salary_revision", "Salary revision", [{ kind: "hr" }]],
    ["leave_encashment", "Leave encashment", [{ kind: "manager" }, { kind: "hr" }]],
  ];
  for (const [type, name, steps] of flows) await db.approvalFlow.upsert({ where: { type }, update: {}, create: { type, name, steps: JSON.stringify(steps) } });
  // Requests menu types (WFH, travel, promotion…): default chains, editable in HR Settings → Approval chains.
  for (const t of REQUEST_TYPES) await db.approvalFlow.upsert({ where: { type: t.type }, update: {}, create: { type: t.type, name: t.label, steps: JSON.stringify(t.steps) } });

  const settings: [string, string][] = [
    ["hr.codePrefix", "TAA-"],
    ["hr.onboarding", ["Collect CNIC copy", "Sign offer letter & contract", "Bank account details", "Create system login", "Issue laptop / SIM", "Introduce to team"].join("\n")],
    ["hr.offboarding", ["Resignation letter received", "Handover of clients & leads", "Return laptop / SIM / keys", "Disable system login", "Final settlement", "Experience letter issued"].join("\n")],
    ["hr.probationMonths", "3"],
  ];
  for (const [key, value] of settings) await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });

}

/** Shifts, 2026 public holidays, leave types, branch geo-fences, and the default shift for anyone without one. */
export async function seedAttendance(db: PrismaClient) {
  const general = await db.shift.upsert({ where: { name: "General (9–6)" }, update: {}, create: { name: "General (9–6)", start: "09:00", end: "18:00", graceMin: 15, halfDayMin: 240, workDays: "1,2,3,4,5,6", isDefault: true } });
  await db.shift.upsert({ where: { name: "Sales (11–8)" }, update: {}, create: { name: "Sales (11–8)", start: "11:00", end: "20:00", graceMin: 15, halfDayMin: 240, workDays: "1,2,3,4,5,6,7" } });

  // Pakistan gazetted holidays 2026. Islamic dates are estimates — confirm against the official notification.
  const holidays: [string, string][] = [
    ["2026-02-05", "Kashmir Day"], ["2026-03-20", "Eid ul Fitr"], ["2026-03-21", "Eid ul Fitr"], ["2026-03-23", "Pakistan Day"],
    ["2026-05-01", "Labour Day"], ["2026-05-27", "Eid ul Adha"], ["2026-05-28", "Eid ul Adha / Youm-e-Takbeer"],
    ["2026-06-25", "Ashura"], ["2026-06-26", "Ashura"], ["2026-08-14", "Independence Day"], ["2026-08-26", "Eid Milad un Nabi"],
    ["2026-11-09", "Iqbal Day"], ["2026-12-25", "Quaid-e-Azam Day"],
  ];
  if (!(await db.holiday.count())) {
    await db.holiday.createMany({ data: holidays.map(([d, name]) => ({ date: new Date(`${d}T00:00:00`), name })) });
  }

  const types: { name: string; code: string; color: string; paid: boolean; quota: number; accrual: string; carryMax: number; gender?: string; halfDay?: boolean }[] = [
    { name: "Annual leave", code: "AL", color: "blue", paid: true, quota: 14, accrual: "annual", carryMax: 7 },
    { name: "Casual leave", code: "CL", color: "violet", paid: true, quota: 10, accrual: "annual", carryMax: 0 },
    { name: "Sick leave", code: "SL", color: "amber", paid: true, quota: 8, accrual: "annual", carryMax: 0 },
    { name: "Unpaid leave", code: "UL", color: "slate", paid: false, quota: 0, accrual: "annual", carryMax: 0 },
    { name: "Maternity leave", code: "ML", color: "teal", paid: true, quota: 90, accrual: "annual", carryMax: 0, gender: "female", halfDay: false },
  ];
  for (const [i, t] of types.entries()) {
    await db.leaveType.upsert({ where: { name: t.name }, update: {}, create: { ...t, gender: t.gender ?? null, halfDay: t.halfDay ?? true, sortOrder: i } });
  }

  await db.branch.updateMany({ where: { code: "DHA", lat: null }, data: { lat: 24.8008, lng: 67.0645, radiusM: 200 } });
  await db.branch.updateMany({ where: { code: "BHD", lat: null }, data: { lat: 24.8829, lng: 67.0687, radiusM: 200 } });
  await db.setting.upsert({ where: { key: "attendance.geofence" }, update: {}, create: { key: "attendance.geofence", value: "warn" } });

  await db.employee.updateMany({ where: { shiftId: null }, data: { shiftId: general.id } });
}

/** Pay components, income-tax slabs and statutory settings. */
export async function seedPayroll(db: PrismaClient) {
  const components: [string, number, boolean, number | null][] = [
    ["Basic salary", 66.67, true, null],
    ["House rent", 23.33, false, null],
    ["Medical", 10, false, 10], // tax-free up to 10% of basic
  ];
  if (!(await db.payComponent.count())) {
    await db.payComponent.createMany({ data: components.map(([name, pctOfGross, isBasic, exemptPctOfBasic], i) => ({ name, pctOfGross, isBasic, exemptPctOfBasic, sortOrder: i })) });
  }

  // Salaried-individual slabs (annual PKR). FY2025-26 per Finance Act 2025; FY2026-27 starts as a copy —
  // HR must confirm it against the Finance Act 2026 in Payroll → Settings.
  const slabs: [number, number | null, number, number][] = [
    [0, 600_000, 0, 0],
    [600_000, 1_200_000, 0, 1],
    [1_200_000, 2_200_000, 6_000, 11],
    [2_200_000, 3_200_000, 116_000, 23],
    [3_200_000, 4_100_000, 346_000, 30],
    [4_100_000, null, 616_000, 35],
  ];
  for (const fy of ["2025-26", "2026-27"]) {
    if (await db.taxSlab.count({ where: { fiscalYear: fy } })) continue;
    await db.taxSlab.createMany({ data: slabs.map(([from, to, fixed, rate]) => ({ fiscalYear: fy, from, to, fixed, rate })) });
  }

  const settings: [string, string][] = [
    ["payroll.eobiEmployee", "400"], // 1% of the minimum wage — confirm the current notification
    ["payroll.eobiEmployer", "2000"],
    ["payroll.latesPerDay", "3"], // every 3 lates = 1 day's pay deducted (0 = off)
    ["payroll.overtimeRate", "0"], // × hourly rate; 0 = overtime not paid
    ["payroll.commission", "off"],
  ];
  for (const [key, value] of settings) await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });

}
