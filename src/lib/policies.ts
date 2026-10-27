// Policy documents: who a policy applies to, acknowledgements per version, publishing (which notifies everyone it
// applies to). Shown in HR → People → Compliance, My Space → My Policies, the profile and the HR dashboard.
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { notify } from "./notify";

export const POLICY_CATEGORIES = ["General", "Code of conduct", "Leave", "Attendance", "IT & security", "Finance", "Health & safety", "Sales"] as const;

type PolicyLike = { audience: string; audienceIds: string | null };
const ids = (p: PolicyLike) => (p.audienceIds ?? "").split(",").filter(Boolean);

/** Active employees a policy applies to. */
export function audienceWhere(p: PolicyLike): Prisma.EmployeeWhereInput {
  const base = { status: { not: "left" } };
  if (p.audience === "branches" && ids(p).length) return { ...base, branchId: { in: ids(p) } };
  if (p.audience === "departments" && ids(p).length) return { ...base, departmentId: { in: ids(p) } };
  return base;
}

export const appliesTo = (p: PolicyLike, e: { branchId: string | null; departmentId: string | null }) =>
  p.audience === "branches" ? ids(p).includes(e.branchId ?? "") : p.audience === "departments" ? ids(p).includes(e.departmentId ?? "") : true;

/** Published policies for one employee with whether they've acknowledged the current version. */
export async function policiesFor(employeeId: string) {
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { branchId: true, departmentId: true } });
  if (!emp) return [];
  const [policies, acks] = await Promise.all([
    db.policy.findMany({ where: { status: "published" }, orderBy: { publishedAt: "desc" } }),
    db.policyAck.findMany({ where: { employeeId } }),
  ]);
  return policies.filter((p) => appliesTo(p, emp)).map((p) => {
    const ack = acks.find((a) => a.policyId === p.id && a.version === p.version);
    return { ...p, ackAt: ack?.createdAt ?? null };
  });
}

/** Acknowledged / total for each policy's current version. */
export async function ackProgress(policies: { id: string; version: number; audience: string; audienceIds: string | null }[]) {
  const out = new Map<string, { done: number; total: number }>();
  for (const p of policies) {
    const where = audienceWhere(p);
    const [total, done] = await Promise.all([
      db.employee.count({ where }),
      db.policyAck.count({ where: { policyId: p.id, version: p.version, employee: where } }),
    ]);
    out.set(p.id, { done, total });
  }
  return out;
}

/** Publishes (a re-publish of a changed policy bumps the version, so everyone acknowledges again) and notifies. */
export async function publishPolicy(id: string, bumpVersion: boolean) {
  const p = await db.policy.update({
    where: { id },
    data: { status: "published", publishedAt: new Date(), ...(bumpVersion && { version: { increment: 1 } }) },
  });
  const people = await db.employee.findMany({ where: { ...audienceWhere(p), userId: { not: null } }, select: { userId: true } });
  for (const e of people) {
    await notify(e.userId!, `${bumpVersion ? "Updated policy" : "New policy"}: ${p.title}`, { body: p.requireAck ? "Please read and acknowledge it." : undefined, link: `/me/policies?open=${p.id}` });
  }
  return p;
}

/** Notifies everyone who hasn't acknowledged the current version yet. */
export async function remindPending(id: string) {
  const p = await db.policy.findUniqueOrThrow({ where: { id } });
  const pending = await db.employee.findMany({
    where: { ...audienceWhere(p), userId: { not: null }, policyAcks: { none: { policyId: p.id, version: p.version } } },
    select: { userId: true },
  });
  for (const e of pending) await notify(e.userId!, `Reminder: please acknowledge “${p.title}”`, { link: `/me/policies?open=${p.id}`, email: true });
  return pending.length;
}
