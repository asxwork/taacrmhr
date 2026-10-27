// Salary revisions and leave encashment, connected to the rest of HR:
// - a revision (single or bulk) goes through the approval chain; approval updates the salary profile, sets the next
//   increment date and writes the history. Direct salary edits and approved promotions are recorded as revisions too.
// - an encashment takes days off the leave balance on approval and is paid by the next payroll run.
import { addMonths, format } from "date-fns";
import { db } from "./db";
import { submitRequest } from "./approvals";
import { addEvent } from "./hr";
import { balancesFor } from "./leave";
import { notify } from "./notify";

export const REVISION_KINDS = [
  { value: "increment", label: "Annual increment" },
  { value: "promotion", label: "Promotion" },
  { value: "adjustment", label: "Adjustment" },
  { value: "decrement", label: "Decrement" },
] as const;
export const revisionKind = (v: string) => REVISION_KINDS.find((k) => k.value === v)?.label ?? v;

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

/** Records a change already made (profile edit, approved promotion) so Salary Revisions shows the full history. */
export async function recordRevision(input: { employeeId: string; oldGross: number; newGross: number; effectiveFrom: Date; kind: string; reason?: string | null; actorId: string | null }) {
  if (input.oldGross === input.newGross) return;
  const { actorId, ...rest } = input;
  await db.salaryRevision.create({ data: { ...rest, reason: rest.reason ?? null, createdById: actorId, status: "approved", appliedAt: new Date() } });
}

/** Creates pending revisions and one approval request covering all of them. */
export async function proposeRevisions(rows: { employeeId: string; newGross: number }[], opts: { kind: string; effectiveFrom: Date; reason: string | null; requesterId: string }) {
  const employees = await db.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, include: { salary: true } });
  const created = [];
  for (const r of rows) {
    const e = employees.find((x) => x.id === r.employeeId);
    if (!e?.salary || Math.round(r.newGross) === Math.round(e.salary.gross)) continue;
    created.push(await db.salaryRevision.create({
      data: { employeeId: e.id, kind: opts.kind, oldGross: e.salary.gross, newGross: Math.round(r.newGross), effectiveFrom: opts.effectiveFrom, reason: opts.reason, createdById: opts.requesterId },
      include: { employee: { select: { fullName: true } } },
    }));
  }
  if (!created.length) return { error: "No salary changes to send (check that each employee has a salary set and the amount differs)." };
  const first = created[0]!;
  const title = created.length === 1
    ? `Salary revision · ${first.employee.fullName}: ${pkr(first.oldGross)} → ${pkr(first.newGross)}`
    : `Salary revision · ${created.length} employees (${revisionKind(opts.kind).toLowerCase()})`;
  const req = await submitRequest({
    type: "salary_revision", employeeId: first.employeeId, requesterId: opts.requesterId, title,
    summary: [`Effective ${format(opts.effectiveFrom, "d MMM yyyy")}`, opts.reason].filter(Boolean).join(" · "), payload: { revisionIds: created.map((c) => c.id) },
  });
  await db.salaryRevision.updateMany({ where: { id: { in: created.map((c) => c.id) } }, data: { approvalId: req.id } });
  return { ok: true as const, count: created.length, requestId: req.id };
}

/** Approval handler: approves every pending revision in the request; ones effective today or earlier apply now. */
export async function applyRevisions(revisionIds: string[], actorId: string) {
  await db.salaryRevision.updateMany({ where: { id: { in: revisionIds }, status: "pending" }, data: { status: "approved" } });
  await applyDueRevisions(actorId, revisionIds);
}

/**
 * Applies approved revisions whose effective date has arrived (daily cron and every payroll run call this), so a
 * future-dated increment changes pay from its date, not from the day it was approved.
 */
export async function applyDueRevisions(actorId: string | null = null, onlyIds?: string[]) {
  const revs = await db.salaryRevision.findMany({
    where: { status: "approved", appliedAt: null, effectiveFrom: { lte: new Date() }, ...(onlyIds && { id: { in: onlyIds } }) },
    include: { employee: { include: { salary: true } } }, orderBy: { effectiveFrom: "asc" },
  });
  for (const r of revs) {
    const sal = r.employee.salary;
    if (!sal) continue;
    await db.salaryProfile.update({
      where: { id: sal.id },
      data: { gross: r.newGross, effectiveFrom: r.effectiveFrom, nextIncrementAt: addMonths(r.effectiveFrom, sal.incrementMonths || 12) },
    });
    await db.salaryRevision.update({ where: { id: r.id }, data: { appliedAt: new Date(), oldGross: sal.gross } });
    await addEvent(r.employeeId, "note", `Salary revised (${revisionKind(r.kind).toLowerCase()}): ${pkr(sal.gross)} → ${pkr(r.newGross)}`, { date: r.effectiveFrom, details: r.reason, byId: actorId ?? r.createdById });
    if (r.employee.userId) await notify(r.employee.userId, "Your salary has been revised", { body: `New gross ${pkr(r.newGross)} from ${format(r.effectiveFrom, "d MMM yyyy")}`, link: "/me" });
  }
  return revs.length;
}

export async function closeRevisions(revisionIds: string[], status: "rejected" | "cancelled") {
  await db.salaryRevision.updateMany({ where: { id: { in: revisionIds }, status: "pending" }, data: { status } });
}

// ─── Leave encashment ───────────────────────────────────────

/** Paid leave types with days left that can be encashed, after other pending encashments. */
export async function encashableBalances(employeeId: string) {
  const year = new Date().getFullYear();
  const [balances, pending] = await Promise.all([
    balancesFor(employeeId, year),
    db.leaveEncashment.findMany({ where: { employeeId, year, status: "pending" }, select: { typeId: true, days: true } }),
  ]);
  return balances.filter((b) => b.type.paid && !b.unlimited).map((b) => {
    const held = pending.filter((p) => p.typeId === b.type.id).reduce((s, p) => s + p.days, 0);
    return { typeId: b.type.id, name: b.type.name, available: Math.max(0, b.available - held) };
  }).filter((b) => b.available > 0);
}

/** Pay for one day: monthly gross / 30, as for absence deductions. */
export const perDayPay = (gross: number) => Math.round((gross / 30) * 100) / 100;

export async function requestEncashment(input: { employeeId: string; typeId: string; days: number; reason: string | null; requesterId: string }) {
  if (!(input.days > 0) || Math.round(input.days * 2) !== input.days * 2) return { error: "Days must be a whole or half number above zero." };
  const emp = await db.employee.findUnique({ where: { id: input.employeeId }, include: { salary: true } });
  if (!emp?.salary) return { error: "This employee has no salary set, so the encashment can't be valued." };
  const bal = (await encashableBalances(emp.id)).find((b) => b.typeId === input.typeId);
  if (!bal) return { error: "No encashable days left for that leave type." };
  if (input.days > bal.available) return { error: `Only ${bal.available} day(s) of ${bal.name} can be encashed.` };
  const perDay = perDayPay(emp.salary.gross);
  const amount = Math.round(perDay * input.days);
  const enc = await db.leaveEncashment.create({
    data: { employeeId: emp.id, typeId: input.typeId, typeName: bal.name, year: new Date().getFullYear(), days: input.days, perDay, amount, reason: input.reason, createdById: input.requesterId },
  });
  const req = await submitRequest({
    type: "leave_encashment", employeeId: emp.id, requesterId: input.requesterId,
    title: `Leave encashment · ${emp.fullName}: ${input.days} day(s) ${bal.name} = ${pkr(amount)}`, summary: input.reason ?? undefined, payload: { encashmentId: enc.id },
  });
  await db.leaveEncashment.update({ where: { id: enc.id }, data: { approvalId: req.id } });
  return { ok: true as const };
}

/** Approval handler: the days leave the balance now; payroll pays the amount. */
export async function approveEncashment(encashmentId: string, actorId: string) {
  const enc = await db.leaveEncashment.findUnique({ where: { id: encashmentId } });
  if (!enc || enc.status !== "pending") return;
  await db.leaveBalance.upsert({
    where: { employeeId_typeId_year: { employeeId: enc.employeeId, typeId: enc.typeId, year: enc.year } },
    update: { adjusted: { decrement: enc.days } },
    create: { employeeId: enc.employeeId, typeId: enc.typeId, year: enc.year, adjusted: -enc.days, note: "Encashed" },
  });
  await db.leaveEncashment.update({ where: { id: enc.id }, data: { status: "approved" } });
  await addEvent(enc.employeeId, "note", `Encashed ${enc.days} day(s) of ${enc.typeName} (${pkr(enc.amount)})`, { byId: actorId, details: "Paid with the next payroll." });
}

export async function closeEncashment(encashmentId: string, status: "rejected" | "cancelled") {
  await db.leaveEncashment.updateMany({ where: { id: encashmentId, status: "pending" }, data: { status } });
}
