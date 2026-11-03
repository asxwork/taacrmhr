// Monthly targets vs. actuals: calls and site visits logged, deals won and their value.
import { endOfMonth, parse } from "date-fns";
import { db } from "./db";

export async function targetProgress(userIds: string[], month: string) {
  const from = parse(month, "yyyy-MM", new Date());
  const to = endOfMonth(from);
  const [targets, acts, won] = await Promise.all([
    db.salesTarget.findMany({ where: { userId: { in: userIds }, month } }),
    db.activity.groupBy({ by: ["createdById", "type"], where: { createdById: { in: userIds }, type: { in: ["call", "visit"] }, createdAt: { gte: from, lte: to } }, _count: true }),
    db.deal.groupBy({ by: ["ownerId"], where: { ownerId: { in: userIds }, stage: { kind: "won" }, closedAt: { gte: from, lte: to } }, _count: true, _sum: { value: true } }),
  ]);
  return new Map(userIds.map((id) => {
    const t = targets.find((x) => x.userId === id);
    const count = (type: string) => acts.find((a) => a.createdById === id && a.type === type)?._count ?? 0;
    const w = won.find((x) => x.ownerId === id);
    return [id, {
      target: { calls: t?.calls ?? 0, visits: t?.visits ?? 0, deals: t?.deals ?? 0, wonValue: t?.wonValue ?? 0 },
      actual: { calls: count("call"), visits: count("visit"), deals: w?._count ?? 0, wonValue: w?._sum.value ?? 0 },
    }];
  }));
}
export type Progress = NonNullable<Awaited<ReturnType<typeof targetProgress>> extends Map<string, infer V> ? V : never>;

/** Average of each set target's % done (targets left at 0 don't count). */
export function overallPct(p: Progress) {
  const parts = (["calls", "visits", "deals", "wonValue"] as const).filter((k) => p.target[k] > 0).map((k) => Math.min(1, p.actual[k] / p.target[k]));
  return parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : null;
}
