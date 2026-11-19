"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { FEATURES, FEATURES_SETTING, HR_ACCESS_SETTING } from "@/lib/features";
import { forget } from "@/lib/memo";
import type { FormState } from "@/lib/utils";

/** Saves which features are on: posted checkboxes `on:<key>` for the ones in use. */
export async function saveFeatures(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const off = FEATURES.filter((f) => fd.get(`on:${f.key}`) !== "on").map((f) => f.key);
  const value = JSON.stringify(off);
  await db.setting.upsert({ where: { key: FEATURES_SETTING }, update: { value }, create: { key: FEATURES_SETTING, value } });
  // HR app or My Space (who works in the HR app); the radio is only on the form for editors.
  const hr = fd.get("hrAccess");
  if (hr === "hr" || hr === "managers") {
    await db.setting.upsert({ where: { key: HR_ACCESS_SETTING }, update: { value: hr }, create: { key: HR_ACCESS_SETTING, value: hr } });
    forget("setting:hrAccess");
  }
  await audit(user.id, "update", "setting", FEATURES_SETTING, off.length ? `Features switched off: ${off.join(", ")}` : "All features on");
  revalidatePath("/", "layout");
  return { ok: true, message: off.length ? `Saved. ${off.length} feature(s) switched off.` : "Saved. All features are on." };
}
