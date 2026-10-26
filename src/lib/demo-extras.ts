// Sample data beyond the basics (see demo-data.ts), so every screen has something to look at: project and source
// details on leads, companies, a deal with a unit and payment plan, pending approvals, recruitment, appraisals,
// assets and last month's payroll. Returns ids of records not owned by a sample user, for removeDemo.
import type { PrismaClient } from "@prisma/client";
import { buildSchedule } from "./inventory-shared";

type DemoUser = { id: string; name: string; branchId: string | null };

export async function demoExtras(
  db: PrismaClient,
  prefix: string,
  u: { head: DemoUser; hr: DemoUser; manager: DemoUser; agent1: DemoUser; agent2: DemoUser; staff: DemoUser },
  employees: { id: string }[],
) {
  const userIds = Object.values(u).map((x) => x.id);
  const now = new Date();
  const day = (offset: number, hour = 11) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, 0, 0);
  const [heights, palm] = await Promise.all([
    db.project.findUnique({ where: { name: "Advisor Heights" } }),
    db.project.findUnique({ where: { name: "Palm Residency" } }),
  ]);

  // CRM: project and source details on the sample leads.
  const sourceInfo: Record<string, string> = {
    Zameen: "Zameen ad: 10 Marla plot for sale, DHA Phase 8",
    Facebook: "Facebook Lead Ad: Advisor Heights launch form",
    Website: "Website enquiry form: 3-bed apartment",
    WhatsApp: "WhatsApp broadcast reply",
    Graana: "Graana listing: Palm Residency 5 Marla",
    CC: "Call centre inbound call",
    Referral: "Referred by an existing client",
    Direct: "Walk-in at the DHA office",
  };
  const leads = await db.lead.findMany({ where: { ownerId: { in: userIds } }, include: { source: true }, orderBy: { createdAt: "asc" } });
  for (const [i, l] of leads.entries()) {
    await db.lead.update({
      where: { id: l.id },
      data: { sourceInfo: sourceInfo[l.source?.name ?? ""] ?? null, projectId: i % 3 === 0 ? heights?.id ?? null : i % 3 === 1 ? palm?.id ?? null : null },
    });
  }

  // CRM: companies, each with one of the sample contacts.
  const companies = [
    { name: "Siddiqui Builders", industry: "Construction", phone: "021-34567890", owner: u.manager },
    { name: "Noor Textiles", industry: "Textiles", phone: "021-35678901", owner: u.agent1 },
    { name: "Gulf Investments LLC", industry: "Investment", phone: "+971 50 1234567", owner: u.agent2 },
  ];
  const contacts = await db.contact.findMany({ where: { ownerId: { in: userIds } }, orderBy: { createdAt: "asc" } });
  for (const [i, c] of companies.entries()) {
    const co = await db.company.create({ data: { name: c.name, industry: c.industry, phone: c.phone, ownerId: c.owner.id, branchId: c.owner.branchId } });
    if (contacts[i]) await db.contact.update({ where: { id: contacts[i].id }, data: { companyId: co.id } });
  }

  // CRM: the biggest open deal books an Advisor Heights unit on a 12-month plan, past installments paid.
  const deal = await db.deal.findFirst({ where: { ownerId: { in: userIds }, stage: { kind: "open" } }, orderBy: { value: "desc" } });
  const unit = heights ? await db.unit.findFirst({ where: { projectId: heights.id, status: "available" }, orderBy: { unitNo: "asc" } }) : null;
  if (deal && unit) {
    await db.dealUnit.create({ data: { dealId: deal.id, unitId: unit.id } });
    await db.unit.update({ where: { id: unit.id }, data: { status: "booked" } });
    const plan = { total: unit.price ?? deal.value ?? 30_000_000, downPct: 25, installments: 12, frequency: "monthly", possessionPct: 10, startDate: day(-45) };
    const created = await db.paymentPlan.create({ data: { dealId: deal.id, ...plan } });
    await db.installment.createMany({
      data: buildSchedule(plan).map((r) => ({
        planId: created.id, seq: r.seq, label: r.label, dueDate: r.dueDate, amount: r.amount,
        ...(r.dueDate < now && { paidAmount: r.amount, paidAt: r.dueDate, method: "Bank transfer" }),
      })),
    });
  }

  // HR: a pending leave and expense claim in the approvals inbox. Written directly (not via submitRequest) so no
  // notification emails go to the fake @demo.local addresses.
  const empOf = (userId: string) => db.employee.findUnique({ where: { userId } });
  const [agent2Emp, staffEmp] = await Promise.all([empOf(u.agent2.id), empOf(u.staff.id)]);
  const casual = await db.leaveType.findUnique({ where: { name: "Casual leave" } });
  if (agent2Emp && casual) {
    const from = day(10, 0);
    const req = await db.leaveRequest.create({ data: { employeeId: agent2Emp.id, typeId: casual.id, from, to: from, days: 1, reason: "Family event" } });
    const approval = await db.approvalRequest.create({
      data: {
        type: "leave", employeeId: agent2Emp.id, requesterId: u.agent2.id, title: `Casual leave — ${agent2Emp.fullName} (1 day)`, summary: "Family event",
        payload: JSON.stringify({ leaveRequestId: req.id }), actions: { create: { step: 0, userId: u.agent2.id, decision: "submitted" } },
      },
    });
    await db.leaveRequest.update({ where: { id: req.id }, data: { approvalId: approval.id } });
  }
  if (staffEmp) {
    const exp = await db.expense.create({ data: { employeeId: staffEmp.id, date: day(-2), category: "Travel", amount: 2_800, description: "Courier and rickshaw to the bank" } });
    const approval = await db.approvalRequest.create({
      data: {
        type: "expense", employeeId: staffEmp.id, requesterId: u.staff.id, title: `Expense — ${staffEmp.fullName}: Travel PKR 2,800`, summary: "Courier and rickshaw to the bank",
        payload: JSON.stringify({ expenseId: exp.id }), actions: { create: { step: 0, userId: u.staff.id, decision: "submitted" } },
      },
    });
    await db.expense.update({ where: { id: exp.id }, data: { approvalId: approval.id } });
  }

  // HR: recruitment, one opening with candidates at every stage, one on hold.
  const [sales, finance, dha] = await Promise.all([
    db.department.findUnique({ where: { name: "Sales" } }),
    db.department.findUnique({ where: { name: "Finance" } }),
    db.branch.findUnique({ where: { code: "DHA" } }),
  ]);
  const consultant = await db.jobOpening.create({
    data: { title: "Property Consultant", departmentId: sales?.id, branchId: dha?.id, positions: 2, salaryRange: "60k – 90k + commission", description: "Handle walk-ins and online leads for DHA and Bahria projects.", createdById: u.hr.id },
  });
  const accountant = await db.jobOpening.create({
    data: { title: "Accountant", departmentId: finance?.id, branchId: dha?.id, positions: 1, status: "on_hold", salaryRange: "80k – 110k", createdById: u.hr.id },
  });
  const candidates = [
    { name: "Usama Khalid", stage: "applied", source: "Rozee.pk", rating: null, phone: "03211112233" },
    { name: "Mehwish Anjum", stage: "screening", source: "LinkedIn", rating: 3, phone: "03332223344" },
    { name: "Danish Rauf", stage: "interview", source: "Referral", rating: 4, phone: "03004445566" },
    { name: "Areeba Sajid", stage: "offer", source: "Walk-in", rating: 5, phone: "03125556677" },
    { name: "Hassan Javed", stage: "rejected", source: "Rozee.pk", rating: 2, phone: "03456667788" },
  ];
  for (const c of candidates) {
    const cand = await db.candidate.create({ data: { openingId: consultant.id, name: c.name, stage: c.stage, source: c.source, rating: c.rating, phone: c.phone, expectedSalary: 75_000 } });
    if (c.stage === "interview") await db.interview.create({ data: { candidateId: cand.id, at: day(1, 15), mode: "onsite", interviewerId: u.manager.id } });
    if (c.stage === "offer") {
      await db.interview.create({ data: { candidateId: cand.id, at: day(-5, 12), mode: "onsite", interviewerId: u.manager.id, outcome: "pass", feedback: "Strong DHA market knowledge; good with clients." } });
    }
  }
  await db.candidate.create({ data: { openingId: accountant.id, name: "Rizwan Ahmed", stage: "screening", source: "Rozee.pk", phone: "03017778899", expectedSalary: 95_000 } });

  // HR: performance, a closed first-half cycle and an open second-half cycle at mixed stages.
  const staff = await db.employee.findMany({ where: { userId: { in: userIds } }, include: { manager: { select: { userId: true } } }, orderBy: { code: "asc" } });
  const year = now.getFullYear();
  const closed = await db.appraisalCycle.create({ data: { name: `${year} H1 review (sample)`, from: new Date(year, 0, 1), to: new Date(year, 5, 30), status: "closed" } });
  const current = await db.appraisalCycle.create({ data: { name: `${year} H2 review (sample)`, from: new Date(year, 6, 1), to: new Date(year, 11, 31) } });
  for (const [i, e] of staff.entries()) {
    const reviewerId = e.manager?.userId ?? null;
    await db.appraisal.create({
      data: {
        cycleId: closed.id, employeeId: e.id, reviewerId, goals: "Hit monthly targets; follow up every lead within 24 hours.",
        selfRating: 3 + (i % 2), selfComments: "Met most targets this half.", managerRating: 3 + ((i + 1) % 3), managerComments: "Reliable; keep improving follow-ups.",
        recommendation: i % 3 === 0 ? "10% increment" : null, status: "done", submittedAt: new Date(year, 6, 5), completedAt: new Date(year, 6, 12),
      },
    });
    const stage = i % 3 === 0 ? "self" : i % 3 === 1 ? "manager" : "done";
    await db.appraisal.create({
      data: {
        cycleId: current.id, employeeId: e.id, reviewerId, goals: "Close 3 deals per quarter.", status: stage,
        ...(stage !== "self" && { selfRating: 4, selfComments: "Good half; closed two bookings.", submittedAt: day(-3) }),
        ...(stage === "done" && { managerRating: 4, managerComments: "Exceeded expectations.", completedAt: day(-1) }),
      },
    });
  }

  // HR: assets, some assigned, one in repair.
  const empByUser = Object.fromEntries(staff.map((e) => [e.userId!, e.id]));
  const assetDefs: { tag: string; name: string; category: string; serial?: string; cost: number; holder?: string; repair?: boolean }[] = [
    { tag: "AST-01", name: "Dell Latitude 5440", category: "Laptop", serial: "DL5440-7781", cost: 285_000, holder: u.manager.id },
    { tag: "AST-02", name: "HP ProBook 450", category: "Laptop", serial: "HP450-1123", cost: 210_000, holder: u.hr.id },
    { tag: "AST-03", name: "Samsung Galaxy A35", category: "Mobile phone", serial: "IMEI 356789012345678", cost: 95_000, holder: u.agent1.id },
    { tag: "AST-04", name: "Jazz SIM", category: "SIM", cost: 500, holder: u.agent2.id },
    { tag: "AST-05", name: "Lenovo ThinkPad E14", category: "Laptop", serial: "TP-E14-5532", cost: 230_000 },
    { tag: "AST-06", name: "iPad 10th gen", category: "Tablet", serial: "IPAD-9921", cost: 140_000, repair: true },
  ];
  const assetIds: string[] = [];
  for (const a of assetDefs) {
    const tag = `${prefix}${a.tag}`;
    if (await db.asset.findUnique({ where: { tag } })) continue;
    const holder = a.holder ? empByUser[a.holder] : undefined;
    const bought = new Date(year - 1, 9, 1);
    const asset = await db.asset.create({
      data: {
        tag, name: a.name, category: a.category, serial: a.serial ?? null, cost: a.cost, purchasedAt: bought,
        status: holder ? "assigned" : a.repair ? "repair" : "available", assignedToId: holder ?? null, assignedAt: holder ? day(-60) : null,
        logs: {
          create: [
            { action: "added", createdAt: bought },
            ...(holder ? [{ action: "assigned", employeeId: holder, note: "With charger and bag", createdAt: day(-60) }] : []),
            ...(a.repair ? [{ action: "repair", note: "Cracked screen" }] : []),
          ],
        },
      },
    });
    assetIds.push(asset.id);
  }

  // HR: last month's payroll for the sample staff, approved so payslips show.
  const runIds: string[] = [];
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;
  if (!(await db.payrollRun.findUnique({ where: { month } }))) {
    const run = await db.payrollRun.create({ data: { month, createdById: u.hr.id } });
    runIds.push(run.id);
    try {
      const { generateRun } = await import("./payroll");
      for (const e of employees) await generateRun(run.id, e.id);
      await db.payrollRun.update({ where: { id: run.id }, data: { status: "approved", approvedById: u.hr.id, approvedAt: new Date() } });
    } catch (err) {
      console.warn("Sample payroll skipped:", err instanceof Error ? err.message : err);
    }
  }

  return { openingIds: [consultant.id, accountant.id], cycleIds: [closed.id, current.id], assetIds, runIds };
}
