import { db } from "@/lib/db";
import { ASSET_CATEGORIES } from "@/lib/hr-shared";

/** Asset types (categories) — editable on Assets → Types; the built-in list until someone changes it. */
export async function assetTypes(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: "assets.types" } });
  try {
    const list = row ? (JSON.parse(row.value) as unknown) : null;
    if (Array.isArray(list) && list.every((x) => typeof x === "string") && list.length) return list.includes("Other") ? list : [...list, "Other"];
  } catch { /* fall back */ }
  return ASSET_CATEGORIES;
}
