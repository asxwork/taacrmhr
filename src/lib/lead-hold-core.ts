// On-hold rules: shared pieces used by the db.ts write hook and by lib/lead-hold.ts.
// Takes the Prisma client as an argument so db.ts can use it without a circular import.
import type { PrismaClient } from "@prisma/client";
import { memo } from "./memo";

export type HoldConfig = { enabled: boolean; toHoldHours: number; reassignHours: number; holdingUserId: string | null };

export const HOLD_KEYS = {
  enabled: "crm.hold.enabled",
  toHoldHours: "crm.hold.toHoldHours",
  reassignHours: "crm.hold.reassignHours",
  holdingUserId: "crm.hold.userId",
} as const;

export function holdConfig(client: PrismaClient): Promise<HoldConfig> {
  return memo("setting:hold", 300_000, async () => {
    const rows = await client.setting.findMany({ where: { key: { in: Object.values(HOLD_KEYS) } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const hours = (k: string, d: number) => Math.max(1, Number(get(k)) || d);
    return {
      enabled: get(HOLD_KEYS.enabled) !== "false",
      toHoldHours: hours(HOLD_KEYS.toHoldHours, 24),
      reassignHours: hours(HOLD_KEYS.reassignHours, 12),
      holdingUserId: get(HOLD_KEYS.holdingUserId) || null,
    };
  });
}

/** Ids of the New Request ("new") and On-hold ("onhold") stages. Cached until a stage is written. */
export function systemStatuses(client: PrismaClient): Promise<{ newId: string | null; onHoldId: string | null }> {
  return memo("leadStatus:system", 300_000, async () => {
    const rows = await client.leadStatus.findMany({ where: { systemKey: { in: ["new", "onhold"] } }, select: { id: true, systemKey: true } });
    return { newId: rows.find((r) => r.systemKey === "new")?.id ?? null, onHoldId: rows.find((r) => r.systemKey === "onhold")?.id ?? null };
  });
}

type LeadData = Record<string, unknown>;

/**
 * Runs before every lead create/update (db.ts):
 * - stamps assignedAt when the responsible person changes and statusChangedAt when the stage changes;
 * - giving an On-hold lead to a real agent puts it back in New Request, so their clock starts fresh.
 */
export async function stampLeadWrite(client: PrismaClient, operation: string, args: { where?: { id?: string }; data?: LeadData }) {
  const data = args.data;
  if (!data) return;
  const now = new Date();
  if (operation === "create") {
    if (data.ownerId && data.assignedAt === undefined) data.assignedAt = now;
    if (data.statusChangedAt === undefined) data.statusChangedAt = now;
    return;
  }
  if (operation !== "update" || !args.where?.id) return;
  const ownerChanging = data.ownerId !== undefined;
  const statusChanging = typeof data.statusId === "string";
  if (!ownerChanging && !statusChanging) return;

  const current = await client.lead.findUnique({ where: { id: args.where.id }, select: { ownerId: true, statusId: true } });
  if (!current) return;
  const ownerChanged = ownerChanging && data.ownerId !== current.ownerId;
  if (ownerChanged && data.assignedAt === undefined) data.assignedAt = now;

  if (ownerChanged && !statusChanging && data.ownerId) {
    const [{ newId, onHoldId }, cfg] = await Promise.all([systemStatuses(client), holdConfig(client)]);
    if (newId && current.statusId === onHoldId && data.ownerId !== cfg.holdingUserId) data.statusId = newId;
  }
  if (typeof data.statusId === "string" && data.statusId !== current.statusId && data.statusChangedAt === undefined) data.statusChangedAt = now;
}
