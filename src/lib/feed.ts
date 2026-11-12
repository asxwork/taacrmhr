// Feed audience: who may see a post. Kept in one place so the page, the dashboard icon and notifications agree.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const KUDOS_BADGES = [
  ["teamwork", "🤝 Team player"],
  ["above", "🚀 Above and beyond"],
  ["helpful", "🙌 Always helpful"],
  ["client", "⭐ Client hero"],
  ["closer", "🏆 Deal closer"],
  ["leader", "🧭 Leadership"],
] as const;
export const badgeLabel = (k: string | null | undefined) => KUDOS_BADGES.find(([v]) => v === k)?.[1] ?? null;

/** Posts this user may see. */
export async function feedWhere(userId: string): Promise<Prisma.FeedPostWhereInput> {
  const me = await db.employee.findUnique({ where: { userId }, select: { id: true, departmentId: true, branchId: true } });
  const OR: Prisma.FeedPostWhereInput[] = [{ audience: "all" }, { authorId: userId }];
  if (me) {
    if (me.departmentId) OR.push({ audience: `dept:${me.departmentId}` });
    if (me.branchId) OR.push({ audience: `branch:${me.branchId}` });
    OR.push({ audience: { startsWith: "people:" }, AND: [{ audience: { contains: me.id } }] }, { employeeId: me.id });
  }
  return { OR };
}

/** User ids an audience reaches (for notifications). */
export async function audienceUsers(audience: string): Promise<string[]> {
  const [kind, rest = ""] = audience.split(":");
  const where: Prisma.EmployeeWhereInput = kind === "dept" ? { departmentId: rest } : kind === "branch" ? { branchId: rest } : kind === "people" ? { id: { in: rest.split(",") } } : {};
  if (kind === "all") return (await db.user.findMany({ where: { active: true }, select: { id: true } })).map((u) => u.id);
  return (await db.employee.findMany({ where: { ...where, status: { not: "left" }, userId: { not: null } }, select: { userId: true } })).map((e) => e.userId!);
}
