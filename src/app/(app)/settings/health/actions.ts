"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { forget } from "@/lib/memo";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

const superAdmin = async () => { const u = await requireUser(); if (!u.isSuperAdmin) throw new Error("Super Admin only."); return u; };

/** The banner everyone sees at the top (e.g. "AMS will update at 8 PM — save your work"). Empty = off. */
export async function saveBanner(_: FormState, fd: FormData): Promise<FormState> {
  const user = await superAdmin();
  const text = str(fd, "banner").slice(0, 200);
  await db.setting.upsert({ where: { key: "maintenance.banner" }, update: { value: text }, create: { key: "maintenance.banner", value: text } });
  await audit(user.id, "update", "settings", null, text ? `Maintenance banner: ${text}` : "Maintenance banner removed");
  forget("setting:banner");
  revalidatePath("/", "layout");
  return { ok: true, message: text ? "Banner is showing to everyone." : "Banner removed." };
}

export async function clearErrors() {
  const user = await superAdmin();
  await db.errorLog.deleteMany({});
  await audit(user.id, "delete", "settings", null, "Cleared the error log");
  revalidatePath("/settings/health");
}

/** Bring missing pictures and files back from the newest Google Drive backup (never overwrites a file). */
export async function restoreMissingFiles(): Promise<FormState> {
  const user = await superAdmin();
  try {
    const r = await (await import("@/lib/upload-safety")).restoreMissingFromBackup();
    if ("error" in r) return { error: r.error };
    await audit(user.id, "update", "settings", null, `Restored ${r.restored} missing file(s) from ${r.from}`);
    revalidatePath("/settings/health");
    return { ok: true, message: r.restored ? `Brought back ${r.restored} file(s) from ${r.from}.${r.still ? ` ${r.still} could not be found in any backup.` : ""}` : r.still ? `${r.still} missing file(s) are not in any of the backups in Google Drive.` : "Nothing is missing." };
  } catch (e) {
    return { error: `Couldn't restore: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}` };
  }
}
