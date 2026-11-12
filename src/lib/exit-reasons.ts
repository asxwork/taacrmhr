import { db } from "@/lib/db";

export const DEFAULT_EXIT_REASONS = ["Resignation", "Better opportunity", "Personal / family", "Relocation", "Termination", "Contract ended", "Retirement", "Freelance", "Other"];

/** Reasons for leaving (End of Employment → Reasons). Stored as one setting; the built-in list until changed. */
export async function exitReasons(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: "hr.exitReasons" } });
  try {
    const v = row ? (JSON.parse(row.value) as unknown) : null;
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return v as string[];
  } catch { /* use defaults */ }
  return DEFAULT_EXIT_REASONS;
}

/** The reason part of a stored exitReason ("Relocation — moving to Lahore" → "Relocation"). */
export const reasonOf = (s: string | null | undefined) => (s ?? "").split(" — ")[0]!.trim();
