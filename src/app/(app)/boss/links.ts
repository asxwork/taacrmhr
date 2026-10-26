import { format } from "date-fns";
import { db } from "@/lib/db";

/** Where the Boss dashboard's numbers lead: lists filtered to the same period, so every figure opens its records. */
export type BossLinks = {
  /** Leads created in the period (all stages unless `group` says otherwise), plus any other lead filters. */
  leads: (filters?: Record<string, string>) => string;
  wonDeals: string;
};

export async function bossLinks(from: Date, to: Date): Promise<BossLinks> {
  const won = await db.stage.findFirst({ where: { kind: "won", pipeline: { isDefault: true } }, select: { id: true, pipelineId: true } });
  return {
    leads: (filters = {}) => `/crm/leads?${new URLSearchParams({ group: "all", created: "custom", cfrom: format(from, "yyyy-MM-dd"), cto: format(to, "yyyy-MM-dd"), ...filters })}`,
    wonDeals: won ? `/crm/deals?view=list&pipeline=${won.pipelineId}&stage=${won.id}` : "/crm/deals",
  };
}
