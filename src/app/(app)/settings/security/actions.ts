"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SECURITY_KEYS } from "@/lib/security";
import { str, type FormState } from "@/lib/utils";

/** Super Admin: idle sign-out and who must use two-step login. */
export async function saveSecurity(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only a Super Admin can change security settings." };
  const idle = Math.max(0, Math.min(480, Number(str(fd, "idleMinutes")) || 0));
  const req = ["none", "superadmin", "all"].includes(str(fd, "require2fa")) ? str(fd, "require2fa") : "none";
  if (req !== "none" && !user.totpEnabled) return { error: "Turn on two-step login for yourself first (My profile → Two-step login), so you can't lock yourself out." };
  for (const [key, value] of [[SECURITY_KEYS.idleMinutes, String(idle)], [SECURITY_KEYS.require2fa, req]] as const) {
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  await audit(user.id, "update", "setting", "security", `Security: idle sign-out ${idle ? `${idle} min` : "off"}, two-step login required for ${req}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
