// Sample data for the newer features (see demo-data.ts): project and unit photos, HR requests (pending, approved
// and rejected, with their effects applied), attendance logs, leads on the On-hold timers, an API connection with
// its intake log, a second deal linked to a unit and an employee serving notice. Returns ids for removeDemo.
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { format, subDays, addDays, isSunday, nextMonday } from "date-fns";
import { saveDemoPhoto } from "./demo-photos";
import { hashKey } from "./lead-intake";

type DemoUser = { id: string; name: string; branchId: string | null };
type Users = { head: DemoUser; hr: DemoUser; manager: DemoUser; agent1: DemoUser; agent2: DemoUser; staff: DemoUser };

export type DemoV2Ids = { leadIds: string[]; apiIds: string[]; logIds: string[]; v2OpeningIds: string[] };

export async function demoV2(db: PrismaClient, u: Users, employees: { id: string; userId: string | null; fullName: string }[]): Promise<DemoV2Ids> {
  const now = new Date();
  const ymd = (d: Date) => format(d, "yyyy-MM-dd");
  const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
  const emp = (user: DemoUser) => employees.find((e) => e.userId === user.id);
  const userIds = Object.values(u).map((x) => x.id);

  // ── Inventory: photos on the sample projects and some units (only where none were added yet).
  const projects = await db.project.findMany({ where: { name: { in: ["Advisor Heights", "Palm Residency"] } }, include: { _count: { select: { images: true } } } });
  let seed = 1;
  for (const p of projects) {
    if (p._count.images) continue;
    const kind = p.name === "Palm Residency" ? "plot" : "tower";
    for (let i = 0; i < 3; i++) await db.projectImage.create({ data: { projectId: p.id, path: await saveDemoPhoto(`projects/${p.id}`, seed++, kind), sortOrder: i } });
    const units = await db.unit.findMany({ where: { projectId: p.id, images: { none: {} } }, orderBy: { unitNo: "asc" }, take: 4 });
    for (const unit of units) {
      for (let i = 0; i < 2; i++) await db.unitImage.create({ data: { unitId: unit.id, path: await saveDemoPhoto(`units/${unit.id}`, seed++, kind), sortOrder: i } });
    }
  }
  const resale = await db.unit.findMany({ where: { ownerId: { in: userIds }, projectId: null, images: { none: {} } }, take: 6 });
  for (const unit of resale) {
    for (let i = 0; i < 2; i++) await db.unitImage.create({ data: { unitId: unit.id, path: await saveDemoPhoto(`units/${unit.id}`, seed++), sortOrder: i } });
  }

  // ── CRM: a second deal books a Palm Residency plot.
  const palm = projects.find((p) => p.name === "Palm Residency");
  const deal = await db.deal.findFirst({ where: { ownerId: { in: userIds }, stage: { kind: "open" }, units: { none: {} } }, orderBy: { value: "desc" } });
  const plot = palm ? await db.unit.findFirst({ where: { projectId: palm.id, status: "available" }, orderBy: { unitNo: "asc" } }) : null;
  if (deal && plot) {
    await db.dealUnit.create({ data: { dealId: deal.id, unitId: plot.id } });
    await db.unit.update({ where: { id: plot.id }, data: { status: "booked" } });
    if (!deal.value && plot.price) await db.deal.update({ where: { id: deal.id }, data: { value: plot.price } });
  }

  // ── CRM: leads on the On-hold timers (two waiting on hold, one about to be moved to On-hold by the hourly rule).
  const leads = await db.lead.findMany({ where: { ownerId: { in: userIds } }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const statuses = await db.leadStatus.findMany({ where: { systemKey: { in: ["new", "onhold"] } } });
  const onHold = statuses.find((s) => s.systemKey === "onhold");
  const fresh = statuses.find((s) => s.systemKey === "new");
  const hours = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const timers: [string | undefined, Date, Date][] = [
    [onHold?.id, hours(34), hours(9)],
    [onHold?.id, hours(30), hours(4)],
    [fresh?.id, hours(23), hours(23)],
  ];
  for (const [i, [statusId, assignedAt, statusChangedAt]] of timers.entries()) {
    const lead = leads[leads.length - 1 - i];
    if (lead && statusId) await db.lead.update({ where: { id: lead.id }, data: { statusId, assignedAt, statusChangedAt } });
  }

  // ── CRM: an API connection (Zameen) with its intake log.
  const source = await db.leadSource.findFirst({ where: { name: "Zameen" } });
  const api = await db.apiConnection.create({
    data: {
      name: "Zameen.com (sample)", keyHash: hashKey(`demo_${randomBytes(18).toString("hex")}`), keyHint: "demo", sourceId: source?.id ?? null,
      assigneeIds: [u.agent1.id, u.agent2.id].join(","), leadCount: 3, lastUsedAt: hours(2),
    },
  });
  const logIds: string[] = [];
  const logLeads = leads.slice(0, 3);
  const entries: { status: string; summary: string; leadId?: string; createdAt: Date }[] = [
    ...logLeads.map((l, i) => ({ status: "created", summary: `Lead from Zameen listing #${48120 + i}`, leadId: l.id, createdAt: hours(2 + i * 20) })),
    { status: "merged", summary: "Repeat enquiry matched an existing lead", leadId: logLeads[0]?.id, createdAt: hours(70) },
    { status: "ignored", summary: "No phone or email for “Guest”", createdAt: hours(90) },
  ];
  for (const e of entries) logIds.push((await db.webhookLog.create({ data: { source: `api:${api.name}`, ...e } })).id);

  // ── HR: attendance logs for the last week (device imports, web check-ins, an HR edit and a correction).
  const workDays: Date[] = [];
  for (let d = subDays(now, 1); workDays.length < 5; d = subDays(d, 1)) if (!isSunday(d)) workDays.push(d);
  const logRows: Parameters<typeof db.attendanceLog.create>[0]["data"][] = [];
  for (const d of workDays) {
    logRows.push({ date: at(d, 20), kind: "import", source: "device", summary: `Device import: ${employees.length * 2} punches for ${employees.length} employees`, byId: u.hr.id, byName: u.hr.name, createdAt: at(d, 20) });
    for (const e of employees.slice(0, 3)) {
      logRows.push({ employeeId: e.id, date: at(d, 0), kind: "checkin", source: "web", summary: `Checked in from the web at ${format(at(d, 9, 5 + employees.indexOf(e) * 7), "h:mm a")}`, byId: e.userId, byName: e.fullName, createdAt: at(d, 9, 5 + employees.indexOf(e) * 7) });
    }
  }
  const a1 = emp(u.agent1), a2 = emp(u.agent2), staffEmp = emp(u.staff), mgr = emp(u.manager);
  if (a2 && workDays[1]) {
    logRows.push({ employeeId: a2.id, date: at(workDays[1], 0), kind: "hr_edit", source: "manual", summary: "Check-in changed by HR (forgot to punch)", before: "no punches", after: "9:00 AM (manual), 6:05 PM (manual)", byId: u.hr.id, byName: u.hr.name, createdAt: at(workDays[1], 19) });
  }
  if (a1 && workDays[2]) {
    logRows.push({ employeeId: a1.id, date: at(workDays[2], 0), kind: "correction", source: "manual", summary: "Attendance correction approved: check-out 7:30 PM (site visit)", before: "9:12 AM (device)", after: "9:12 AM (device), 7:30 PM (manual)", byId: u.manager.id, byName: u.manager.name, createdAt: at(workDays[2], 21) });
  }
  for (const data of logRows) await db.attendanceLog.create({ data });

  // ── HR: requests of every kind — pending ones wait in Approvals, approved ones have changed the records.
  const [designation, bhd, finance, evening] = await Promise.all([
    db.designation.findFirst({ where: { name: "Sales Manager" } }),
    db.branch.findFirst({ where: { code: "BHD" } }),
    db.department.findUnique({ where: { name: "Finance" } }),
    db.shift.findFirst({ orderBy: { name: "desc" } }),
  ]);
  const monday = nextMonday(now);
  const lastSunday = subDays(now, now.getDay() || 7);
  type Spec = { type: string; who?: { id: string; fullName: string }; by: DemoUser; title: string; p: Record<string, string>; names?: Record<string, string>; state: "pending" | "approved" | "rejected"; step?: number; ago: number; comment?: string };
  const specs: Spec[] = [
    { type: "wfh", who: a1, by: u.agent1, title: `WFH ${format(monday, "d MMM")}–${format(addDays(monday, 1), "d MMM")} · ${a1?.fullName}`, p: { from: ymd(monday), to: ymd(addDays(monday, 1)), reason: "Internet installation at home; will take calls as usual." }, state: "pending", ago: 3 },
    { type: "travel", who: mgr, by: u.manager, title: `Travel to Lahore ${format(addDays(monday, 7), "d MMM")}–${format(addDays(monday, 9), "d MMM")} · ${mgr?.fullName}`, p: { destination: "Lahore", from: ymd(addDays(monday, 7)), to: ymd(addDays(monday, 9)), cost: "85000", reason: "Developer meetings for the new Gulberg project." }, state: "pending", ago: 20 },
    { type: "overtime", who: staffEmp, by: u.staff, title: `Overtime 3h on ${format(workDays[0]!, "d MMM")} · ${staffEmp?.fullName}`, p: { date: ymd(workDays[0]!), hours: "3", reason: "Month-end filing and courier dispatch." }, state: "pending", step: 1, ago: 10 },
    { type: "ticket", who: staffEmp, by: u.staff, title: "Ticket: Printer on 2nd floor not working", p: { category: "it", subject: "Printer on 2nd floor not working", details: "Paper jam light stays on after clearing; nobody can print contracts." }, state: "pending", ago: 5 },
    { type: "shift_adjustment", who: a2, by: u.agent2, title: `Shift adjustment ${format(addDays(monday, 2), "d MMM")} · ${a2?.fullName}`, p: { date: ymd(addDays(monday, 2)), ...(evening ? { shiftId: evening.id } : { start: "12:00", end: "21:00" }), reason: "Evening site visits with clients." }, names: evening ? { shiftId: evening.name } : undefined, state: "pending", ago: 26 },
    { type: "relaxation", who: a2, by: u.agent2, title: `Relaxation ${format(workDays[0]!, "d MMM")} · ${a2?.fullName}`, p: { date: ymd(workDays[0]!), kind: "late", minutes: "40", reason: "Stuck in traffic after a client meeting at the site." }, state: "pending", ago: 14 },
    ...(designation ? [{ type: "promotion", who: a1, by: u.manager, title: `Promotion to ${designation.name} · ${a1?.fullName}`, p: { designationId: designation.id, salary: "140000", effective: ymd(addDays(now, 14)), reason: "Top closer two quarters running." }, names: { designationId: designation.name }, state: "pending" as const, ago: 48 }] : []),
    { type: "official_duty", who: a1, by: u.agent1, title: `Official duty ${format(workDays[2]!, "d MMM")} at DHA Phase 8 site · ${a1?.fullName}`, p: { date: ymd(workDays[2]!), start: "10:00", end: "17:00", place: "DHA Phase 8 site", reason: "Site visits with three Advisor Heights buyers." }, state: "approved", ago: 96 },
    { type: "wfh", who: a2, by: u.agent2, title: `WFH ${format(workDays[3]!, "d MMM")} · ${a2?.fullName}`, p: { from: ymd(workDays[3]!), to: ymd(workDays[3]!), reason: "Child unwell." }, state: "approved", ago: 120 },
    { type: "cpl", who: staffEmp, by: u.staff, title: `CPL for ${format(lastSunday, "d MMM")} · ${staffEmp?.fullName}`, p: { date: ymd(lastSunday), reason: "Came in Sunday for the property expo setup." }, state: "approved", ago: 30 },
    { type: "requisition", who: mgr, by: u.manager, title: "Requisition: 2 × Property Consultant (Bahria)", p: { title: "Property Consultant (Bahria)", positions: "2", ...(bhd ? { branchId: bhd.id } : {}), salaryRange: "70k–100k + commission", reason: "Bahria walk-ins doubled since the Palm launch." }, names: bhd ? { branchId: bhd.name } : undefined, state: "approved", ago: 72 },
    { type: "resignation", who: staffEmp, by: u.staff, title: `Resignation · ${staffEmp?.fullName} (last day ${format(addDays(now, 24), "d MMM")})`, p: { lastDay: ymd(addDays(now, 24)), reason: "Moving to Islamabad with family." }, state: "approved", ago: 50 },
    ...(finance ? [{ type: "transfer", who: a2, by: u.agent2, title: `Transfer to Finance · ${a2?.fullName}`, p: { departmentId: finance.id, effective: ymd(addDays(now, 30)), reason: "Interested in accounts." }, names: { departmentId: finance.name }, state: "rejected" as const, ago: 160, comment: "Still on probation; let's revisit after confirmation." }] : []),
  ];

  const openingsBefore = new Set((await db.jobOpening.findMany({ select: { id: true } })).map((o) => o.id));
  const { applyTypedRequest } = await import("./requests");
  for (const s of specs) {
    if (!s.who) continue;
    const created = hours(s.ago);
    const approver = s.type === "official_duty" || s.type === "shift_adjustment" || s.type === "relaxation" ? u.manager : u.hr;
    const req = await db.approvalRequest.create({
      data: {
        type: s.type, employeeId: s.who.id, requesterId: s.by.id, title: s.title, summary: s.p.reason ?? s.p.details ?? null, payload: JSON.stringify({ ...s.p, names: s.names ?? {} }),
        status: s.state, step: s.step ?? 0, createdAt: created, decidedAt: s.state === "pending" ? null : hours(s.ago - 4),
        actions: {
          create: [
            { step: 0, userId: s.by.id, decision: "submitted", createdAt: created },
            ...(s.step ? [{ step: 0, userId: u.manager.id, decision: "approved", createdAt: hours(s.ago - 2) }] : []),
            ...(s.state !== "pending" ? [{ step: 0, userId: approver.id, decision: s.state, comment: s.comment ?? null, createdAt: hours(s.ago - 4) }] : []),
          ],
        },
      },
    });
    if (s.state === "approved") await applyTypedRequest(req, approver.id);
  }
  const v2OpeningIds = (await db.jobOpening.findMany({ select: { id: true } })).map((o) => o.id).filter((id) => !openingsBefore.has(id));

  return { leadIds: leads.map((l) => l.id), apiIds: [api.id], logIds, v2OpeningIds };
}

/** Profile details for the sample staff: name parts, personal fields, relatives, qualifications and salary banks. */
export async function demoProfiles(db: PrismaClient, employees: { id: string; fullName: string; gender: string | null; joiningDate: Date }[]) {
  const banks = ["Meezan Bank", "HBL", "Bank Alfalah", "MCB", "UBL", "Dubai Islamic Bank"];
  const fathers = ["Muhammad Irfan", "Abdul Rashid", "Tariq Mehmood", "Javed Iqbal", "Khalid Hussain", "Nasir Ahmed"];
  const year = (y: number, m = 0) => new Date(y, m, 1);
  for (const [i, e] of employees.entries()) {
    if (await db.employeeRelative.findFirst({ where: { employeeId: e.id } })) continue;
    const [first, ...rest] = e.fullName.split(" ");
    const female = e.gender === "female";
    const born = new Date(1985 + i * 2, (i * 3) % 12, 5 + i);
    await db.employee.update({
      where: { id: e.id },
      data: {
        salutation: female ? "Ms" : "Mr", firstName: first, lastName: rest.join(" ") || null, fatherName: fathers[i % fathers.length],
        motherName: ["Shahida Begum", "Nasreen Akhtar", "Rukhsana Bibi"][i % 3], religion: "Islam", nationality: "Pakistani",
        dob: born, maritalStatus: i % 2 ? "Single" : "Married", bloodGroup: ["B+", "O+", "A+", "AB+", "O-", "B-"][i % 6],
        phone: `9230012345${String(10 + i)}`, cnicIssued: new Date(2019, i % 12, 10), cnicExpiry: new Date(2029, i % 12, 10),
        officialEmail: null, permanentAddress: ["House 12, Gulshan-e-Iqbal Block 5, Karachi", "Flat 4B, Clifton Block 2, Karachi"][i % 2],
        grade: ["Management", "G4", "G4", "G2", "G1", "G1"][i] ?? "G2", jobTitle: null,
        isHod: i < 3, emergencyName: fathers[i % fathers.length], emergencyRelation: "Father", emergencyPhone: `9232198765${String(10 + i)}`,
      },
    });
    await db.employeeRelative.createMany({
      data: [
        { employeeId: e.id, name: fathers[i % fathers.length]!, relation: "Father", phone: `9232198765${String(10 + i)}`, emergency: true },
        ...(i % 2 ? [] : [{ employeeId: e.id, name: female ? "Imran Ali" : "Ayesha Khan", relation: "Spouse", dependent: true, dob: new Date(1990 + i, 4, 12) }]),
      ],
    });
    await db.employeeQualification.createMany({
      data: [
        { employeeId: e.id, kind: "education", title: i < 3 ? "MBA (Marketing)" : "BBA", institution: i % 2 ? "University of Karachi" : "IBA Karachi", from: year(2005 + i * 2, 8), to: year(2009 + i * 2, 5), grade: "3.4 CGPA" },
        { employeeId: e.id, kind: "experience", title: i < 3 ? "Senior Sales Executive" : "Sales Executive", institution: ["Zameen.com", "Agency21", "Graana.com"][i % 3], from: year(2015 + i, 1), to: new Date(e.joiningDate.getTime() - 30 * 86_400_000), notes: "Residential sales, DHA and Bahria" },
        ...(i % 3 === 0 ? [{ employeeId: e.id, kind: "certification", title: "Certified Real Estate Agent", institution: "ABAD", from: year(2023, 2), to: year(2026, 2) }] : []),
      ],
    });
    const bankName = banks[i % banks.length]!;
    const accountNumber = `PK${String(36 + i).padStart(2, "0")}MEZN000${String(1234567890 + i * 1111)}`;
    await db.employeeBank.create({ data: { employeeId: e.id, bankName, branchName: `${bankName} Clifton Branch`, branchCode: String(1200 + i * 7), accountTitle: e.fullName, accountNumber, effectiveFrom: e.joiningDate } });
    await db.employee.update({ where: { id: e.id }, data: { bankName, accountTitle: e.fullName, accountNumber } });
  }
}

/** A few accolades, newsletter items and quotes for the HR dashboard. */
export async function demoPosts(db: PrismaClient, u: { hr: { id: string } }, employees: { id: string; userId: string | null }[]) {
  if (await db.hrPost.count()) return;
  const day = (n: number) => new Date(Date.now() - n * 86_400_000);
  const by = u.hr.id;
  const e = (i: number) => employees[i]?.id ?? null;
  await db.hrPost.createMany({
    data: [
      { kind: "accolade", title: "Top closer of the month", body: "Closed 3 Advisor Heights apartments in October.", employeeId: e(3), createdById: by, createdAt: day(2) },
      { kind: "accolade", title: "Best customer feedback", body: "Five 5-star reviews from Palm Residency buyers.", employeeId: e(4), createdById: by, createdAt: day(9) },
      { kind: "news", title: "Palm Residency Phase 2 launch", body: "Bookings open on the 1st. New payment plan: 25% down, 36 monthly installments.", createdById: by, createdAt: day(1) },
      { kind: "news", title: "Office closed for Iqbal Day", body: "Both branches are closed on 9 November.", createdById: by, createdAt: day(6) },
      { kind: "wisdom", title: "The best way to predict the future is to create it.", body: "Peter Drucker", createdById: by, createdAt: day(0) },
    ],
  });
}

/** Salary revision history, a pending bulk increment, increments coming due and two leave encashments. */
export async function demoCompensation(db: PrismaClient, u: { hr: { id: string }; manager: { id: string } }, employees: { id: string; fullName: string }[]) {
  if (await db.salaryRevision.count({ where: { employeeId: { in: employees.map((e) => e.id) } } })) return;
  const now = new Date();
  const d = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const emps = await db.employee.findMany({ where: { id: { in: employees.map((e) => e.id) } }, include: { salary: true }, orderBy: { code: "asc" } });
  const withSalary = emps.filter((e) => e.salary);
  // History: last year's increments, already applied.
  for (const e of withSalary) {
    const old = Math.round(e.salary!.gross / 1.1);
    await db.salaryRevision.create({ data: { employeeId: e.id, kind: "increment", oldGross: old, newGross: e.salary!.gross, effectiveFrom: new Date(now.getFullYear(), 0, 1), reason: "Annual increment", status: "approved", appliedAt: new Date(now.getFullYear(), 0, 1), createdById: u.hr.id } });
    await db.salaryProfile.update({ where: { id: e.salary!.id }, data: { nextIncrementAt: new Date(now.getFullYear() + 1, 0, 1) } });
  }
  // Two people due soon (one overdue).
  if (withSalary[3]) await db.salaryProfile.update({ where: { id: withSalary[3].salary!.id }, data: { nextIncrementAt: d(12) } });
  if (withSalary[5]) await db.salaryProfile.update({ where: { id: withSalary[5].salary!.id }, data: { nextIncrementAt: d(-5) } });
  // A pending bulk increment for Sales, as one approval.
  const sales = withSalary.filter((e) => e.departmentId && e.departmentId === withSalary[2]?.departmentId);
  if (sales.length) {
    const ids: string[] = [];
    for (const e of sales) ids.push((await db.salaryRevision.create({ data: { employeeId: e.id, kind: "increment", oldGross: e.salary!.gross, newGross: Math.round(e.salary!.gross * 1.08), effectiveFrom: d(35), reason: "Sales team mid-year increment (8%)", createdById: u.hr.id } })).id);
    const req = await db.approvalRequest.create({
      data: {
        type: "salary_revision", employeeId: sales[0]!.id, requesterId: u.hr.id, title: `Salary revision · ${sales.length} employees (annual increment)`, summary: "Sales team mid-year increment (8%)",
        payload: JSON.stringify({ revisionIds: ids }), actions: { create: { step: 0, userId: u.hr.id, decision: "submitted" } },
      },
    });
    await db.salaryRevision.updateMany({ where: { id: { in: ids } }, data: { approvalId: req.id } });
  }
  // Leave encashments: one waiting, one approved for the next payroll.
  const annual = await db.leaveType.findFirst({ where: { active: true, paid: true }, orderBy: [{ accrual: "asc" }, { sortOrder: "asc" }] });
  if (annual) {
    for (const [i, status] of (["pending", "approved"] as const).entries()) {
      const e = withSalary[i + 1];
      if (!e) continue;
      const days = 2 + i;
      const perDay = Math.round((e.salary!.gross / 30) * 100) / 100;
      const enc = await db.leaveEncashment.create({ data: { employeeId: e.id, typeId: annual.id, typeName: annual.name, year: now.getFullYear(), days, perDay, amount: Math.round(perDay * days), reason: "Unused leave", status, createdById: u.hr.id } });
      if (status === "pending") {
        const req = await db.approvalRequest.create({
          data: {
            type: "leave_encashment", employeeId: e.id, requesterId: e.userId ?? u.hr.id, title: `Leave encashment · ${e.fullName}: ${days} day(s) ${annual.name}`, summary: "Unused leave",
            payload: JSON.stringify({ encashmentId: enc.id }), actions: { create: { step: 0, userId: e.userId ?? u.hr.id, decision: "submitted" } },
          },
        });
        await db.leaveEncashment.update({ where: { id: enc.id }, data: { approvalId: req.id } });
      } else {
        await db.leaveBalance.upsert({
          where: { employeeId_typeId_year: { employeeId: e.id, typeId: annual.id, year: now.getFullYear() } },
          update: { adjusted: { decrement: days } }, create: { employeeId: e.id, typeId: annual.id, year: now.getFullYear(), adjusted: -days, note: "Encashed" },
        });
      }
    }
  }
}
