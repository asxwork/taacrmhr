"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { employeeAllows } from "@/lib/hr";
import { REVISION_KINDS, proposeRevisions, requestEncashment } from "@/lib/compensation";
import { str, type FormState } from "@/lib/utils";

const payrollAdmin = (user: SessionUser) => user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
const day = (v: string) => {
  const d = v ? new Date(`${v}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Single revision (new amount or %) or bulk % increment for a department / branch / everyone; one approval each time. */
export async function proposeRevision(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!payrollAdmin(user)) return { error: "Only payroll admins can propose salary revisions." };
  const kind = REVISION_KINDS.some((k) => k.value === str(fd, "kind")) ? str(fd, "kind") : "increment";
  const effectiveFrom = day(str(fd, "effectiveFrom"));
  if (!effectiveFrom) return { error: "Choose the effective date." };
  const reason = str(fd, "reason").slice(0, 1000) || null;
  const pct = parseFloat(str(fd, "pct"));
  const amount = parseFloat(str(fd, "newGross").replace(/,/g, ""));

  let rows: { employeeId: string; newGross: number }[];
  if (str(fd, "mode") === "bulk") {
    if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 100) return { error: "Enter the increment % (for example 10)." };
    const where = {
      status: { not: "left" }, salary: { isNot: null },
      ...(str(fd, "departmentId") && { departmentId: str(fd, "departmentId") }),
      ...(str(fd, "branchId") && { branchId: str(fd, "branchId") }),
    };
    const emps = await db.employee.findMany({ where, include: { salary: true } });
    rows = emps.map((e) => ({ employeeId: e.id, newGross: Math.round((e.salary!.gross * (100 + pct)) / 100) }));
  } else {
    const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") }, include: { salary: true } });
    if (!emp) return { error: "Choose the employee." };
    if (!emp.salary) return { error: `${emp.fullName} has no salary yet; set it on their profile first.` };
    const newGross = Number.isFinite(amount) && amount > 0 ? amount : Number.isFinite(pct) ? (emp.salary.gross * (100 + pct)) / 100 : NaN;
    if (!(newGross > 0)) return { error: "Enter the new gross salary or an increment %." };
    rows = [{ employeeId: emp.id, newGross }];
  }
  if (!rows.length) return { error: "Nobody with a salary matches." };
  const res = await proposeRevisions(rows, { kind, effectiveFrom, reason, requesterId: user.id });
  if ("error" in res) return { error: res.error };
  revalidatePath("/hr/salary-revisions");
  return { ok: true, message: `Sent ${res.count} revision${res.count === 1 ? "" : "s"} for approval.` };
}

/** Encash unused paid leave: employees for themselves, HR for anyone they manage. */
export async function sendEncashment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const self = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  const employeeId = str(fd, "employeeId") || self?.id;
  if (!employeeId) return { error: "Your login isn't linked to an employee record yet." };
  if (employeeId !== self?.id) {
    const emp = await db.employee.findUnique({ where: { id: employeeId } });
    if (!emp || !can(user, "hr.leave", "edit") || !(await employeeAllows(user, emp, "edit"))) return { error: "You can't request this for that employee." };
  }
  const res = await requestEncashment({ employeeId, typeId: str(fd, "typeId"), days: parseFloat(str(fd, "days")), reason: str(fd, "reason").slice(0, 500) || null, requesterId: user.id });
  if ("error" in res) return { error: res.error };
  revalidatePath("/hr/leave-encashment");
  revalidatePath("/me/leave");
  return { ok: true, message: "Sent for approval. Once approved it is paid with the next payroll." };
}

/**
 * Past revisions pasted from the old HR system (ResourceInn's Salary Revisions list): history only, recorded as approved
 * and already applied, so today's salary is left alone. Each row needs an employee code, a date and two amounts.
 */
export async function importPastRevisions(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!payrollAdmin(user)) return { error: "Only payroll admins can add salary history." };
  const text = str(fd, "text");
  if (!text.trim()) return { error: "Paste the revisions list first." };
  // One block per revision: split on the SR- codes when present, otherwise one per line.
  const blocks = /SR-\d+/.test(text) ? text.split(/SR-\d+/).slice(1) : text.split(/\n+/);
  const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
  const emps = await db.employee.findMany({ select: { id: true, code: true } });
  const byCode = new Map(emps.map((e) => [e.code.toUpperCase(), e.id]));
  let added = 0, skipped = 0;
  const problems: string[] = [];
  for (const b of blocks) {
    if (!b.trim()) continue;
    const code = [...b.matchAll(/\b([A-Z]{1,5}-?\d{2,6})\b/g)].map((m) => m[1]!.toUpperCase()).find((c) => byCode.has(c));
    const dm = b.match(new RegExp(`(${MONTHS})\\.? (\\d{1,2}),? (\\d{4})`, "i")) ?? b.match(/(\d{4})-(\d{2})-(\d{2})/);
    const date = dm ? new Date(dm[0].includes("-") ? `${dm[0]}T00:00:00` : `${dm[1]} ${dm[2]}, ${dm[3]} 00:00:00`) : null;
    // Amounts: numbers after ₨/Rs/PKR, or any number with a thousands comma.
    const amounts = [...b.matchAll(/(?:₨|Rs\.?|PKR)\s*([\d,]+(?:\.\d+)?)|\b(\d{1,3}(?:,\d{3})+)\b/gi)].map((m) => parseFloat((m[1] ?? m[2])!.replace(/,/g, ""))).filter((n) => n > 0);
    const label = b.trim().split(/\s+/).slice(0, 4).join(" ");
    if (!code) { problems.push(`${label}: employee code not found`); continue; }
    if (!date || Number.isNaN(date.getTime())) { problems.push(`${code}: no date`); continue; }
    if (amounts.length < 2) { problems.push(`${code}: needs previous and revised salary`); continue; }
    const [oldGross, newGross] = amounts as [number, number];
    const employeeId = byCode.get(code)!;
    if (await db.salaryRevision.findFirst({ where: { employeeId, effectiveFrom: date, newGross } })) { skipped++; continue; }
    // createdAt = effective date, so the SR- numbers follow the history in date order.
    await db.salaryRevision.create({ data: { employeeId, oldGross, newGross, effectiveFrom: date, kind: newGross >= oldGross ? "increment" : "decrement", reason: "Imported from the old HR system", status: "approved", appliedAt: date, createdAt: date, createdById: user.id } });
    added++;
  }
  revalidatePath("/hr/salary-revisions");
  if (!added && !skipped) return { error: problems.length ? problems.join(" · ") : "Couldn’t read any revisions from that text." };
  return { ok: true, message: `${added} past revision${added === 1 ? "" : "s"} added${skipped ? `, ${skipped} already there` : ""}.${problems.length ? ` Not added: ${problems.join(" · ")}` : ""}` };
}
