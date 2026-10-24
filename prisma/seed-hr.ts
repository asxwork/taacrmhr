import type { PrismaClient } from "@prisma/client";

/** Departments, designations, approval flows, checklist templates, and employee records for the demo users. */
export async function seedHr(db: PrismaClient, demo = true) {
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
  ];
  for (const [type, name, steps] of flows) await db.approvalFlow.upsert({ where: { type }, update: {}, create: { type, name, steps: JSON.stringify(steps) } });

  const settings: [string, string][] = [
    ["hr.codePrefix", "TAA-"],
    ["hr.onboarding", ["Collect CNIC copy", "Sign offer letter & contract", "Bank account details", "Create system login", "Issue laptop / SIM", "Introduce to team"].join("\n")],
    ["hr.offboarding", ["Resignation letter received", "Handover of clients & leads", "Return laptop / SIM / keys", "Disable system login", "Final settlement", "Experience letter issued"].join("\n")],
    ["hr.probationMonths", "3"],
  ];
  for (const [key, value] of settings) await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });

  if (!demo || (await db.employee.count()) > 0) return;

  const dept = Object.fromEntries((await db.department.findMany()).map((d) => [d.name, d.id]));
  const desig = Object.fromEntries((await db.designation.findMany()).map((d) => [d.name, d.id]));
  const users = Object.fromEntries((await db.user.findMany()).map((u) => [u.email, u]));
  const people: { email: string; dept: string; desig: string; joined: string; status: string; gender: string; manager?: string }[] = [
    { email: "admin@advisor.local", dept: "Management", desig: "Administrator", joined: "2022-01-10", status: "active", gender: "male" },
    { email: "hr@advisor.local", dept: "HR & Admin", desig: "HR Manager", joined: "2023-03-01", status: "active", gender: "female", manager: "admin@advisor.local" },
    { email: "manager@advisor.local", dept: "Sales", desig: "Sales Manager", joined: "2023-06-15", status: "active", gender: "male", manager: "admin@advisor.local" },
    { email: "agent1@advisor.local", dept: "Sales", desig: "Property Consultant", joined: "2025-02-01", status: "active", gender: "male", manager: "manager@advisor.local" },
    { email: "agent2@advisor.local", dept: "Sales", desig: "Property Consultant", joined: "2026-08-20", status: "probation", gender: "female", manager: "manager@advisor.local" },
    { email: "staff@advisor.local", dept: "HR & Admin", desig: "Office Assistant", joined: "2024-11-05", status: "active", gender: "male", manager: "hr@advisor.local" },
  ];

  const byEmail: Record<string, string> = {};
  for (const [i, p] of people.entries()) {
    const u = users[p.email];
    if (!u) continue;
    const joiningDate = new Date(p.joined);
    const probationEnd = new Date(joiningDate);
    probationEnd.setMonth(probationEnd.getMonth() + 3);
    const emp = await db.employee.create({
      data: {
        code: `TAA-${String(i + 1).padStart(4, "0")}`, userId: u.id, fullName: u.name, gender: p.gender, phone: u.phone,
        joiningDate, status: p.status, probationEnd, confirmedAt: p.status === "active" ? probationEnd : null,
        departmentId: dept[p.dept], designationId: desig[p.desig], branchId: u.branchId, city: "Karachi",
        cnic: `42101-${String(1234567 + i * 1111).slice(0, 7)}-${i % 9}`,
        events: { create: [{ type: "joined", date: joiningDate, title: `Joined as ${p.desig}` }, ...(p.status === "active" ? [{ type: "confirmed", date: probationEnd, title: "Confirmed after probation" }] : [])] },
      },
    });
    byEmail[p.email] = emp.id;
  }
  for (const p of people) {
    if (p.manager && byEmail[p.email] && byEmail[p.manager]) {
      await db.employee.update({ where: { id: byEmail[p.email] }, data: { managerId: byEmail[p.manager] } });
    }
  }
  // The probation hire still has onboarding to finish.
  const newbie = byEmail["agent2@advisor.local"];
  if (newbie) {
    const tasks = settings.find(([k]) => k === "hr.onboarding")![1].split("\n");
    await db.checklistItem.createMany({
      data: tasks.map((title, i) => ({ employeeId: newbie, kind: "onboarding", title, sortOrder: i, doneAt: i < 3 ? new Date() : null })),
    });
  }
}

/** Shifts, 2026 public holidays, leave types, branch geo-fences, device IDs and ~3 weeks of demo punches. */
export async function seedAttendance(db: PrismaClient, demo = true) {
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

  const employees = await db.employee.findMany({ orderBy: { code: "asc" } });
  for (const [i, e] of employees.entries()) {
    if (!e.deviceUserId) await db.employee.update({ where: { id: e.id }, data: { deviceUserId: String(i + 1), shiftId: e.shiftId ?? general.id } });
  }

  if (!demo || (await db.attendancePunch.count()) > 0) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const punches: { employeeId: string; at: Date; source: string }[] = [];
  for (let back = 21; back >= 1; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    if (d.getDay() === 0) continue; // Sunday off
    for (const [i, e] of employees.entries()) {
      if (d < e.joiningDate) continue;
      const roll = (back * 7 + i * 13) % 20;
      if (roll === 0) continue; // absent
      const inMin = 8 * 60 + 45 + ((back + i * 5) % 50); // 08:45–09:34 → some late
      const outMin = roll === 1 ? 13 * 60 : 18 * 60 + ((back * 3 + i) % 75); // one half day, some overtime
      punches.push({ employeeId: e.id, at: new Date(d.getTime() + inMin * 60_000), source: "device" });
      if (roll !== 2) punches.push({ employeeId: e.id, at: new Date(d.getTime() + outMin * 60_000), source: "device" }); // one missing check-out
    }
  }
  await db.attendancePunch.createMany({ data: punches });

  // One approved leave so the calendar and balances show something.
  const agent = employees.find((e) => e.code.endsWith("0004"));
  const annual = await db.leaveType.findUnique({ where: { name: "Annual leave" } });
  if (agent && annual) {
    const from = new Date(today);
    from.setDate(from.getDate() + 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    await db.leaveRequest.create({ data: { employeeId: agent.id, typeId: annual.id, from, to, days: 2, reason: "Family wedding", status: "approved", decidedAt: new Date() } });
  }
}
