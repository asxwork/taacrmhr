import { db } from "./db";
import { memo } from "./memo";
import { DEFAULT_DEAL_TYPES } from "./deal-types-shared";

export const DEAL_TYPES_SETTING = "crm.dealTypes";

/** The company's deal & inventory types, in order. */
export function dealTypes(): Promise<string[]> {
  return memo("setting:dealTypes", 5 * 60_000, async () => {
    const row = await db.setting.findUnique({ where: { key: DEAL_TYPES_SETTING } });
    try { const v = row ? (JSON.parse(row.value) as string[]) : null; return v?.length ? v : DEFAULT_DEAL_TYPES; } catch { return DEFAULT_DEAL_TYPES; }
  });
}
