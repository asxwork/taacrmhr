// Leave planner: who is off when, and clash warnings when too many people from one department are away.
import { db } from "./db";
import { disabledFeatures } from "./features";

/** A department "clashes" on a day when at least this many people are off and it's 30%+ of the department. */
export const CLASH_MIN = 2;
export const CLASH_SHARE = 0.3;

/** Others from the same department off (approved or pending) on any day of this leave request. */
export async function leaveClashes(leaveRequestId: string) {
  if ((await disabledFeatures()).has("leaveplanner")) return null;
  const req = await db.leaveRequest.findUnique({ where: { id: leaveRequestId }, include: { employee: { select: { id: true, departmentId: true, department: { select: { name: true } } } } } });
  if (!req?.employee.departmentId) return null;
  const [others, size] = await Promise.all([
    db.leaveRequest.findMany({
      where: { id: { not: req.id }, status: { in: ["approved", "pending"] }, from: { lte: req.to }, to: { gte: req.from }, employee: { departmentId: req.employee.departmentId, status: { not: "left" } } },
      include: { employee: { select: { fullName: true } }, type: { select: { name: true } } },
      orderBy: { from: "asc" },
    }),
    db.employee.count({ where: { departmentId: req.employee.departmentId, status: { not: "left" } } }),
  ]);
  return { department: req.employee.department?.name ?? "", size, others };
}
