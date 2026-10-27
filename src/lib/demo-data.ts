// Sample data: staff users, leads, deals, contacts, inventory, employees, attendance, salaries, a loan and an expense,
// plus everything in demo-extras.ts (companies, payment plan, approvals, recruitment, appraisals, assets, payroll).
// Used by the local seed (prisma/seed.ts) and by Settings → Company → "Load sample data" on a live install.
// Requires the configuration seed (branches, roles, statuses, pipelines, departments, shifts…) to have run.
import type { PrismaClient } from "@prisma/client";
import { nextNumber } from "./sequence";
import { demoExtras } from "./demo-extras";
import { demoCompensation, demoPosts, demoProfiles, demoV2 } from "./demo-v2";
import { deleteUpload } from "./files";

export type DemoOptions = {
  passwordHash: string;
  /** Every sample user gets an email on this domain; removal deletes users on it. */
  domain: string;
  /** Local only: also create admin@domain as Super Admin. Live installs get a CEO with the Employee role instead. */
  withSuperAdmin: boolean;
  codePrefix: string;
};

const MARKER = "demo.data";

export async function demoLoaded(db: PrismaClient) {
  return !!(await db.setting.findUnique({ where: { key: MARKER } }));
}

export async function loadDemo(db: PrismaClient, o: DemoOptions) {
  if (await demoLoaded(db)) return { error: "Sample data is already loaded." };
  const [branches, roleRows] = await Promise.all([db.branch.findMany(), db.role.findMany()]);
  const dha = branches.find((b) => b.code === "DHA") ?? branches[0];
  const bhd = branches.find((b) => b.code === "BHD") ?? dha;
  const roles = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));
  if (!dha) return { error: "Add a branch first." };

  const at = (local: string) => `${local}@${o.domain}`;
  const upsertUser = (local: string, data: { name: string; title: string; branchId?: string; managerId?: string; isSuperAdmin?: boolean; role?: string }) => {
    const { role, ...rest } = data;
    return db.user.upsert({
      where: { email: at(local) },
      update: {},
      create: { email: at(local), passwordHash: o.passwordHash, ...rest, roles: role && roles[role] ? { create: { roleId: roles[role] } } : undefined },
    });
  };
  const head = await upsertUser("admin", o.withSuperAdmin
    ? { name: "System Admin", title: "Administrator", branchId: dha.id, isSuperAdmin: true }
    : { name: "Kamran Siddiqui", title: "Chief Executive", branchId: dha.id, role: "Employee" });
  const hr = await upsertUser("hr", { name: "Hina Rashid", title: "HR Manager", branchId: dha.id, role: "HR Manager" });
  const manager = await upsertUser("manager", { name: "Saad Malik", title: "Sales Manager", branchId: dha.id, role: "Sales Manager" });
  const agent1 = await upsertUser("agent1", { name: "Ali Raza", title: "Property Consultant", branchId: dha.id, managerId: manager.id, role: "Agent" });
  const agent2 = await upsertUser("agent2", { name: "Sana Khan", title: "Property Consultant", branchId: bhd!.id, managerId: manager.id, role: "Agent" });
  const staff = await upsertUser("staff", { name: "Usman Tariq", title: "Office Assistant", branchId: bhd!.id, role: "Employee" });

  await demoCrm(db, [agent1, agent2, manager]);
  const projectIds = await demoInventory(db, [agent1, agent2]);
  const employees = await demoEmployees(db, o.codePrefix, [
    { user: head, dept: "Management", desig: o.withSuperAdmin ? "Administrator" : "Chief Executive", joined: "2022-01-10", status: "active", gender: "male", gross: 450_000 },
    { user: hr, dept: "HR & Admin", desig: "HR Manager", joined: "2023-03-01", status: "active", gender: "female", manager: 0, gross: 220_000 },
    { user: manager, dept: "Sales", desig: "Sales Manager", joined: "2023-06-15", status: "active", gender: "male", manager: 0, gross: 260_000 },
    { user: agent1, dept: "Sales", desig: "Property Consultant", joined: "2025-02-01", status: "active", gender: "male", manager: 2, gross: 95_000 },
    { user: agent2, dept: "Sales", desig: "Property Consultant", joined: "2026-08-20", status: "probation", gender: "female", manager: 2, gross: 80_000 },
    { user: staff, dept: "HR & Admin", desig: "Office Assistant", joined: "2024-11-05", status: "active", gender: "male", manager: 1, gross: 45_000 },
  ]);
  await demoAttendance(db, employees);
  const extra = await demoExtras(db, o.codePrefix, { head, hr, manager, agent1, agent2, staff }, employees);
  const empRows = await db.employee.findMany({ where: { id: { in: employees.map((e) => e.id) } }, orderBy: { code: "asc" } });
  const v2 = await demoV2(db, { head, hr, manager, agent1, agent2, staff }, empRows);
  await demoProfiles(db, empRows);
  await demoPosts(db, { hr }, empRows);
  await demoCompensation(db, { hr, manager }, empRows);
  const value = JSON.stringify({ domain: o.domain, projectIds, ...extra, ...v2, v2: true, v3: true, v4: true, v5: true });
  await db.setting.upsert({ where: { key: MARKER }, update: { value }, create: { key: MARKER, value } });
  return { users: 6, employees: employees.length, projects: projectIds.length };
}

/** Deletes the sample users and everything they own (leads, deals, contacts, listings, employee records) plus the sample projects. */
/**
 * Brings sample data loaded by an older version up to date (runs from the seed on every deploy; does nothing
 * once done): earlier attendance for last month's payroll, then everything in demo-extras.
 */
export async function upgradeDemo(db: PrismaClient) {
  const row = await db.setting.findUnique({ where: { key: MARKER } });
  if (!row) return;
  let marker = JSON.parse(row.value) as { domain: string; openingIds?: string[]; v2?: boolean; v3?: boolean; v4?: boolean; v5?: boolean };
  if (marker.openingIds && marker.v2 && marker.v3 && marker.v4 && marker.v5) return;
  const users = await db.user.findMany({ where: { email: { endsWith: `@${marker.domain}` } } });
  const by = (local: string) => users.find((x) => x.email === `${local}@${marker.domain}`);
  const [head, hr, manager, agent1, agent2, staff] = ["admin", "hr", "manager", "agent1", "agent2", "staff"].map(by);
  if (!head || !hr || !manager || !agent1 || !agent2 || !staff) return;
  const employees = await db.employee.findMany({ where: { userId: { in: users.map((x) => x.id) } }, orderBy: { code: "asc" } });
  const save = () => db.setting.update({ where: { key: MARKER }, data: { value: JSON.stringify(marker) } });
  if (!marker.openingIds) {
    const earliest = await db.attendancePunch.findFirst({ where: { employeeId: { in: employees.map((e) => e.id) } }, orderBy: { at: "asc" } });
    if (earliest) {
      const before = new Date(earliest.at);
      before.setHours(0, 0, 0, 0);
      await demoAttendance(db, employees, before);
    }
    const prefix = employees[0]?.code.replace(/\d+$/, "") ?? "DEMO-";
    marker = { ...marker, ...(await demoExtras(db, prefix, { head, hr, manager, agent1, agent2, staff }, employees)) };
    await save();
    console.log("Sample data upgraded with recruitment, appraisals, assets, payroll, approvals and companies.");
  }
  if (!marker.v2) {
    marker = { ...marker, ...(await demoV2(db, { head, hr, manager, agent1, agent2, staff }, employees)), v2: true };
    await save();
    console.log("Sample data upgraded with photos, HR requests, attendance logs, On-hold leads and an API connection.");
  }
  if (!marker.v3) {
    await demoProfiles(db, employees);
    marker = { ...marker, v3: true };
    await save();
    console.log("Sample data upgraded with profile details, relatives, qualifications and banks.");
  }
  if (!marker.v4) {
    await demoPosts(db, { hr }, employees);
    marker = { ...marker, v4: true };
    await save();
    console.log("Sample data upgraded with HR dashboard posts.");
  }
  if (!marker.v5) {
    await demoCompensation(db, { hr, manager }, employees);
    marker = { ...marker, v5: true };
    await save();
    console.log("Sample data upgraded with salary revisions and leave encashments.");
  }
}

export async function removeDemo(db: PrismaClient) {
  const row = await db.setting.findUnique({ where: { key: MARKER } });
  if (!row) return { error: "No sample data is loaded." };
  const { domain, projectIds, openingIds = [], cycleIds = [], assetIds = [], runIds = [], leadIds = [], apiIds = [], logIds = [], v2OpeningIds = [] } = JSON.parse(row.value) as {
    domain: string; projectIds: string[]; openingIds?: string[]; cycleIds?: string[]; assetIds?: string[]; runIds?: string[];
    leadIds?: string[]; apiIds?: string[]; logIds?: string[]; v2OpeningIds?: string[];
  };
  const users = await db.user.findMany({ where: { email: { endsWith: `@${domain}` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const owned = { ownerId: { in: ids } };
  const photos = await Promise.all([
    db.projectImage.findMany({ where: { projectId: { in: projectIds } }, select: { path: true } }),
    db.unitImage.findMany({ where: { unit: { OR: [owned, { projectId: { in: projectIds } }] } }, select: { path: true } }),
  ]);
  await db.$transaction([
    db.attendanceLog.deleteMany({ where: { employeeId: null, byId: { in: ids } } }),
    db.hrPost.deleteMany({ where: { createdById: { in: ids } } }),
    db.activity.deleteMany({ where: { OR: [owned, { createdById: { in: ids } }] } }),
    db.deal.deleteMany({ where: owned }),
    // Sample leads the On-hold rules moved to the holding user are found by id.
    db.lead.deleteMany({ where: { OR: [owned, { id: { in: leadIds } }] } }),
    db.apiConnection.deleteMany({ where: { id: { in: apiIds } } }),
    db.webhookLog.deleteMany({ where: { id: { in: logIds } } }),
    db.contact.deleteMany({ where: owned }),
    db.company.deleteMany({ where: owned }),
    db.jobOpening.deleteMany({ where: { id: { in: [...openingIds, ...v2OpeningIds] } } }),
    db.appraisalCycle.deleteMany({ where: { id: { in: cycleIds } } }),
    db.asset.deleteMany({ where: { id: { in: assetIds } } }),
    db.payrollRun.deleteMany({ where: { id: { in: runIds } } }),
    db.unit.deleteMany({ where: { OR: [owned, { projectId: { in: projectIds } }] } }),
    db.project.deleteMany({ where: { id: { in: projectIds } } }),
    db.employee.deleteMany({ where: { userId: { in: ids } } }),
    db.user.deleteMany({ where: { id: { in: ids } } }),
    db.setting.delete({ where: { key: MARKER } }),
  ]);
  for (const p of photos.flat()) await deleteUpload(p.path);
  return { users: ids.length };
}

async function demoCrm(db: PrismaClient, owners: { id: string; branchId: string | null }[]) {
  const [statusRows, sources, sales] = await Promise.all([
    db.leadStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany(),
    db.pipeline.findUnique({ where: { name: "Sales" }, include: { stages: { orderBy: { sortOrder: "asc" } } } }),
  ]);
  if (!statusRows.length || !sales) return;
  const src = (n: string) => sources.find((s) => s.name === n)?.id;
  const names = [
    "Ahmed Siddiqui", "Fatima Noor", "Bilal Qureshi", "Ayesha Javed", "Hamza Sheikh", "Zainab Ali", "Omar Farooq", "Maryam Iqbal",
    "Faisal Mehmood", "Sara Hussain", "Imran Baig", "Nida Aslam", "Kashif Anwar", "Rabia Shah", "Tariq Jamil", "Hira Abbasi",
  ];
  const srcNames = ["Facebook", "Zameen", "CC", "Direct", "Website", "WhatsApp", "Referral", "Graana"];
  const locations = ["DHA Phase 6", "DHA Phase 8", "Bahria Town", "Clifton Block 5", "Gulshan-e-Iqbal", "PECHS"];
  const types = ["Apartment", "House", "Plot", "Shop"];

  for (const [i, name] of names.entries()) {
    const owner = owners[i % owners.length]!;
    const status = statusRows[i % Math.min(5, statusRows.length)]!;
    const phone = `0300${(1234560 + i * 7919).toString().slice(0, 7)}`;
    const budget = (i % 4 + 1) * 15_000_000;
    const lead = await db.lead.create({
      data: {
        number: await nextNumber("lead", db), name, phone, phoneKey: phone, email: `${name.split(" ")[0]!.toLowerCase()}@example.com`,
        sourceId: src(srcNames[i % srcNames.length]!), interest: i % 3 === 0 ? "rent" : "buy",
        propertyType: types[i % types.length], location: locations[i % locations.length],
        budgetMin: budget, budgetMax: budget * 1.3, statusId: status.id,
        ownerId: owner.id, createdById: owner.id, branchId: owner.branchId,
        createdAt: new Date(Date.now() - i * 2 * 864e5), lastActivityAt: new Date(Date.now() - i * 864e5),
      },
    });
    await db.activity.create({
      data: { type: "call", subject: "Intro call", body: "Discussed requirements and budget.", doneAt: new Date(Date.now() - i * 864e5), leadId: lead.id, ownerId: owner.id, createdById: owner.id, branchId: owner.branchId },
    });
    if (i % 3 === 0) {
      await db.activity.create({
        data: { type: "task", subject: "Follow up on shortlist", dueAt: new Date(Date.now() + ((i % 5) - 2) * 864e5), leadId: lead.id, ownerId: owner.id, createdById: owner.id, branchId: owner.branchId },
      });
    }

    if (status.kind === "converted" || i % 4 === 1) {
      const contact = await db.contact.create({
        data: { name, phone, phoneKey: phone, email: lead.email, sourceId: lead.sourceId, ownerId: owner.id, branchId: owner.branchId },
      });
      const stage = sales.stages[i % sales.stages.length]!;
      await db.deal.create({
        data: {
          title: `${lead.propertyType} — ${lead.location}`, pipelineId: sales.id, stageId: stage.id, contactId: contact.id, leadId: lead.id,
          sourceId: lead.sourceId, value: budget, commissionPct: 1, ownerId: owner.id, branchId: owner.branchId,
          expectedClose: new Date(Date.now() + (i + 5) * 864e5), closedAt: stage.kind === "open" ? null : new Date(),
          lostReason: stage.kind === "lost" ? "Budget mismatch" : null,
        },
      });
      await db.lead.update({ where: { id: lead.id }, data: { contactId: contact.id } });
    }
  }
}

/** Two sample projects (skipped if a project with the same name exists) and four agent listings. Returns the project ids created. */
async function demoInventory(db: PrismaClient, agents: { id: string; branchId: string | null }[]) {
  const statuses = ["available", "available", "available", "booked", "available", "sold", "hold", "available"];
  const created: string[] = [];
  let i = 0;

  if (!(await db.project.findUnique({ where: { name: "Advisor Heights" } }))) {
    const heights = await db.project.create({
      data: {
        name: "Advisor Heights", code: "AH", developer: "Advisor Developers", location: "DHA Phase 8", kind: "residential", status: "active",
        description: "Luxury apartments with sea-facing towers.", planDownPct: 25, planInstallments: 36, planFrequency: "monthly", planPossessionPct: 10,
        blocks: { create: [{ name: "Tower A", sortOrder: 0 }, { name: "Tower B", sortOrder: 1 }] },
      },
      include: { blocks: true },
    });
    created.push(heights.id);
    for (const block of heights.blocks) {
      const floors = block.name === "Tower A" ? 5 : 3;
      for (let floor = 1; floor <= floors; floor++) {
        for (let n = 1; n <= 4; n++) {
          const beds = n <= 2 ? 2 : 3;
          const size = beds === 2 ? 1350 : 1900;
          await db.unit.create({
            data: {
              projectId: heights.id, blockId: block.id, unitNo: `${block.name.slice(-1)}-${floor}0${n}`, type: "Apartment",
              size, sizeUnit: "sqft", bedrooms: beds, bathrooms: beds, floor: String(floor), facing: n % 2 ? "Sea" : "Park",
              corner: n === 1 || n === 4, price: size * (24000 + floor * 500), status: statuses[i++ % statuses.length]!,
            },
          });
        }
      }
    }
  }

  if (!(await db.project.findUnique({ where: { name: "Palm Residency" } }))) {
    const palm = await db.project.create({
      data: {
        name: "Palm Residency", code: "PR", developer: "Palm Builders", location: "Scheme 33", kind: "residential", status: "active",
        planDownPct: 20, planInstallments: 12, planFrequency: "quarterly", planPossessionPct: 0,
        blocks: { create: [{ name: "Block P1", sortOrder: 0 }, { name: "Block P2", sortOrder: 1 }] },
      },
      include: { blocks: true },
    });
    created.push(palm.id);
    for (const block of palm.blocks) {
      for (let n = 1; n <= 16; n++) {
        const marla = n % 3 === 0 ? 10 : 5;
        await db.unit.create({
          data: {
            projectId: palm.id, blockId: block.id, unitNo: `${block.name.slice(-2)}-${n}`, type: "Plot", size: marla, sizeUnit: "marla",
            corner: n % 8 === 1, parkFacing: n % 5 === 0, mainRoad: n <= 2, price: marla * 1_150_000 + (n % 8 === 1 ? 800_000 : 0),
            status: statuses[(i++ + n) % statuses.length]!,
          },
        });
      }
    }
  }

  // Agent listings (resale / rental)
  const listings = [
    { unitNo: "House 42", type: "House", purpose: "sale", listingType: "resale", size: 500, sizeUnit: "sqyd", bedrooms: 5, price: 135_000_000, address: "Khayaban-e-Shamsheer, DHA Phase 5", propertyOwner: "Mr. Kamran Ahmed" },
    { unitNo: "Flat 3B", type: "Apartment", purpose: "rent", listingType: "rental", size: 1800, sizeUnit: "sqft", bedrooms: 3, price: 250_000, address: "Clifton Block 2", propertyOwner: "Mrs. Rubina Saleem" },
    { unitNo: "Shop 7", type: "Shop", purpose: "sale", listingType: "resale", size: 400, sizeUnit: "sqft", price: 38_000_000, address: "Bahadurabad Chowrangi", propertyOwner: "Mr. Asif Lakhani" },
    { unitNo: "Villa 11", type: "House", purpose: "rent", listingType: "rental", size: 1000, sizeUnit: "sqyd", bedrooms: 6, price: 900_000, address: "DHA Phase 6", propertyOwner: "Mr. Naveed Iqbal" },
  ];
  for (const [n, l] of listings.entries()) {
    const agent = agents[n % agents.length]!;
    await db.unit.create({ data: { ...l, status: "available", ownerId: agent.id, branchId: agent.branchId } });
  }
  return created;
}

type Person = {
  user: { id: string; name: string; phone: string | null; branchId: string | null };
  dept: string; desig: string; joined: string; status: string; gender: string; gross: number;
  /** Index of this person's manager in the list. */
  manager?: number;
};

/** Employee records for the sample users, with salaries; index 3 (first agent) gets an advance and an expense, index 4 is still onboarding. */
async function demoEmployees(db: PrismaClient, prefix: string, people: Person[]) {
  const dept = Object.fromEntries((await db.department.findMany()).map((d) => [d.name, d.id]));
  const desig = Object.fromEntries((await db.designation.findMany()).map((d) => [d.name, d.id]));
  const shift = await db.shift.findFirst({ where: { isDefault: true } });
  const taken = new Set((await db.employee.findMany({ select: { code: true, deviceUserId: true } })).flatMap((e) => [e.code, `dev:${e.deviceUserId}`]));
  let seq = 1;
  let device = 1;

  const employees: { id: string; joiningDate: Date }[] = [];
  for (const [i, p] of people.entries()) {
    while (taken.has(`${prefix}${String(seq).padStart(4, "0")}`)) seq++;
    while (taken.has(`dev:${device}`)) device++;
    const joiningDate = new Date(p.joined);
    const probationEnd = new Date(joiningDate);
    probationEnd.setMonth(probationEnd.getMonth() + 3);
    const emp = await db.employee.create({
      data: {
        code: `${prefix}${String(seq++).padStart(4, "0")}`, userId: p.user.id, fullName: p.user.name, gender: p.gender, phone: p.user.phone,
        joiningDate, status: p.status, probationEnd, confirmedAt: p.status === "active" ? probationEnd : null,
        departmentId: dept[p.dept], designationId: desig[p.desig], branchId: p.user.branchId, city: "Karachi",
        cnic: `42101-${String(1234567 + i * 1111).slice(0, 7)}-${i % 9}`, deviceUserId: String(device++), shiftId: shift?.id,
        events: { create: [{ type: "joined", date: joiningDate, title: `Joined as ${p.desig}` }, ...(p.status === "active" ? [{ type: "confirmed", date: probationEnd, title: "Confirmed after probation" }] : [])] },
        salary: { create: { gross: p.gross, effectiveFrom: joiningDate, pfPct: i < 3 ? 5 : 0 } },
      },
    });
    employees.push(emp);
  }
  for (const [i, p] of people.entries()) {
    if (p.manager !== undefined) await db.employee.update({ where: { id: employees[i]!.id }, data: { managerId: employees[p.manager]!.id } });
  }

  const newbie = employees[4];
  const onboarding = (await db.setting.findUnique({ where: { key: "hr.onboarding" } }))?.value;
  if (newbie && onboarding) {
    await db.checklistItem.createMany({
      data: onboarding.split("\n").map((title, i) => ({ employeeId: newbie.id, kind: "onboarding", title, sortOrder: i, doneAt: i < 3 ? new Date() : null })),
    });
  }

  const agent = employees[3];
  if (agent) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await db.loan.create({ data: { employeeId: agent.id, kind: "advance", amount: 30_000, installment: 10_000, startMonth: month, reason: "Medical emergency", status: "active" } });
    await db.expense.create({ data: { employeeId: agent.id, date: new Date(now.getFullYear(), now.getMonth(), 5), category: "Fuel", amount: 4_500, description: "Site visits DHA Phase 8", status: "approved" } });
    const annual = await db.leaveType.findUnique({ where: { name: "Annual leave" } });
    if (annual) {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() + 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      await db.leaveRequest.create({ data: { employeeId: agent.id, typeId: annual.id, from, to, days: 2, reason: "Family wedding", status: "approved", decidedAt: new Date() } });
    }
  }
  return employees;
}

/** Device punches from the 1st of last month to yesterday (so last month's payroll is realistic), with some lates, absences, half days and missing check-outs. */
async function demoAttendance(db: PrismaClient, employees: { id: string; joiningDate: Date }[], before?: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const punches: { employeeId: string; at: Date; source: string }[] = [];
  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const span = Math.round((+today - +firstOfLastMonth) / 864e5);
  for (let back = span; back >= 1; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    if (before && d >= before) continue; // upgrading: only fill days before the existing punches
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
}
