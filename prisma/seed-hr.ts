import type { PrismaClient } from "@prisma/client";

/** Departments, designations, approval flows, checklist templates, and employee records for the demo users. */
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
  ];
  for (const [type, name, steps] of flows) await db.approvalFlow.upsert({ where: { type }, update: {}, create: { type, name, steps: JSON.stringify(steps) } });

  const settings: [string, string][] = [
    ["hr.codePrefix", "TAA-"],
    ["hr.onboarding", ["Collect CNIC copy", "Sign offer letter & contract", "Bank account details", "Create system login", "Issue laptop / SIM", "Introduce to team"].join("\n")],
    ["hr.offboarding", ["Resignation letter received", "Handover of clients & leads", "Return laptop / SIM / keys", "Disable system login", "Final settlement", "Experience letter issued"].join("\n")],
    ["hr.probationMonths", "3"],
  ];
  for (const [key, value] of settings) await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });

  if ((await db.employee.count()) > 0) return;

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
