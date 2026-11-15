"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canStoreSecrets, openSecret, sealSecret } from "@/lib/softphone";
import { newRecoveryCodes, newTotpSecret, verifyTotp } from "@/lib/totp";
import { securitySettings, twoStepRequired } from "@/lib/security";
import { can } from "@/lib/permissions";
import { str, type FormState } from "@/lib/utils";

/** Step 1: a new authenticator key (not active until a code from it is confirmed). */
export async function startTotp(): Promise<FormState> {
  const user = await requireUser();
  if (user.viewAs) return { error: "Not while viewing as someone else." };
  if (!canStoreSecrets()) return { error: "The server needs SIP_SECRET_KEY (or CRON_SECRET) set to store two-step keys securely." };
  await db.user.update({ where: { id: user.id }, data: { totpSecret: sealSecret(newTotpSecret()), totpEnabled: false } });
  revalidatePath("/profile/security");
  return { ok: true };
}

/** Step 2: a code from the app proves it's set up; two-step login is now on. */
export async function confirmTotp(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const row = await db.user.findUnique({ where: { id: user.id }, select: { totpSecret: true } });
  const secret = openSecret(row?.totpSecret ?? null);
  if (!secret) return { error: "Start the setup again." };
  if (!verifyTotp(secret, str(fd, "code"))) return { error: "That code didn't match. Check the time on your phone and use the newest code." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpRecovery: sealSecret(newRecoveryCodes().join(",")) } });
  await audit(user.id, "update", "user", user.id, `${user.name} turned on two-step login`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Two-step login is on. Save your backup codes below." };
}

export async function disableTotp(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const s = await securitySettings();
  if (twoStepRequired(user, s, can(user, "finance") || can(user, "finance.boss"))) return { error: "Two-step login is required for you by company policy." };
  const row = await db.user.findUnique({ where: { id: user.id }, select: { totpSecret: true } });
  const secret = openSecret(row?.totpSecret ?? null);
  if (secret && !verifyTotp(secret, str(fd, "code"))) return { error: "Enter a current code from your app to turn it off." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, totpRecovery: null } });
  await audit(user.id, "update", "user", user.id, `${user.name} turned off two-step login`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Two-step login is off." };
}

/** New backup codes (the old ones stop working). */
export async function newBackupCodes(): Promise<FormState> {
  const user = await requireUser();
  if (user.viewAs || !user.totpEnabled) return { error: "Turn on two-step login first." };
  await db.user.update({ where: { id: user.id }, data: { totpRecovery: sealSecret(newRecoveryCodes().join(",")) } });
  await audit(user.id, "update", "user", user.id, `${user.name} made new two-step backup codes`);
  revalidatePath("/profile/security");
  return { ok: true, message: "New backup codes are ready. The old ones no longer work." };
}
