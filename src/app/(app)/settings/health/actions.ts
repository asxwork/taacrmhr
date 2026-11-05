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
