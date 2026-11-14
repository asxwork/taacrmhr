// Server data for lead scores: how often each lead source becomes a client (cached 30 minutes).
import { db } from "./db";
import { memo } from "./memo";

export function sourceRates(): Promise<Map<string, number>> {
  return memo("lead-score:sources", 30 * 60_000, async () => {
    const [all, converted] = await Promise.all([
      db.lead.groupBy({ by: ["sourceId"], where: { sourceId: { not: null } }, _count: true }),
      db.lead.groupBy({ by: ["sourceId"], where: { sourceId: { not: null }, status: { kind: "converted" } }, _count: true }),
    ]);
    // Only sources with enough leads to say something.
    return new Map(all.filter((a) => a._count >= 10).map((a) => [a.sourceId!, (converted.find((c) => c.sourceId === a.sourceId)?._count ?? 0) / a._count]));
  });
}
