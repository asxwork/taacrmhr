import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { scopeMatcher, scopeWhere } from "./permissions";
import type { SessionUser } from "./auth";
import type { Action } from "./rbac";

export * from "./hr-shared";

// Employees are scoped like CRM records, with the linked login (userId) as the "owner":
// own = my record, team = me + people reporting to me, branch = my branch, all = everyone.
const FIELDS = { owner: "userId", branch: "branchId" };

export async function employeeWhere(user: SessionUser, action: Action = "view"): Promise<Prisma.EmployeeWhereInput | null> {
  return scopeWhere(user, "hr.employees", action, FIELDS) as Promise<Prisma.EmployeeWhereInput | null>;
}

export async function employeeAllows(user: SessionUser, emp: { userId: string | null; branchId: string | null }, action: Action) {
  return (await scopeMatcher(user, "hr.employees", action))({ ownerId: emp.userId, branchId: emp.branchId });
}

export async function getSetting(key: string, fallback = "") {
  return (await db.setting.findUnique({ where: { key } }))?.value ?? fallback;
}

/** Next code like TAA-0007 (prefix from HR settings). */
export async function nextEmployeeCode() {
  const prefix = await getSetting("hr.codePrefix", "EMP-");
  const codes = await db.employee.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
  const max = codes.reduce((m, c) => Math.max(m, Number(c.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Keep the login in step with HR data: manager (for Team scope), branch and job title. */
export async function syncUserFromEmployee(employeeId: string) {
  const e = await db.employee.findUnique({ where: { id: employeeId }, include: { manager: true, designation: true } });
  if (!e?.userId) return;
  await db.user.update({
    where: { id: e.userId },
    data: { managerId: e.manager?.userId ?? null, branchId: e.branchId, title: e.designation?.name ?? undefined, ...(e.status === "left" && { active: false }) },
  });
}

export async function addEvent(employeeId: string, type: string, title: string, opts: { date?: Date; details?: string | null; byId?: string | null } = {}) {
  await db.employeeEvent.create({ data: { employeeId, type, title, date: opts.date ?? new Date(), details: opts.details ?? null, byId: opts.byId ?? null } });
}

/** Creates the onboarding/offboarding checklist from the templates in HR settings (skips if one exists). */
export async function ensureChecklist(employeeId: string, kind: "onboarding" | "offboarding") {
  if (await db.checklistItem.count({ where: { employeeId, kind } })) return;
  const lines = (await getSetting(`hr.${kind}`)).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length) await db.checklistItem.createMany({ data: lines.map((title, i) => ({ employeeId, kind, title, sortOrder: i })) });
}

export async function myEmployee(userId: string) {
  return db.employee.findUnique({ where: { userId }, include: { department: true, designation: true, branch: true, manager: true } });
}
