"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canStoreSecrets, openSecret, sealSecret } from "@/lib/softphone";
import { newTotpSecret, verifyTotp } from "@/lib/totp";
import { securitySettings } from "@/lib/security";
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
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await audit(user.id, "update", "user", user.id, `${user.name} turned on two-step login`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Two-step login is on. You'll be asked for a code each time you sign in." };
}

export async function disableTotp(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const s = await securitySettings();
  if (s.require2fa === "all" || (s.require2fa === "superadmin" && user.isSuperAdmin)) return { error: "Two-step login is required for you by company policy." };
  const row = await db.user.findUnique({ where: { id: user.id }, select: { totpSecret: true } });
  const secret = openSecret(row?.totpSecret ?? null);
  if (secret && !verifyTotp(secret, str(fd, "code"))) return { error: "Enter a current code from your app to turn it off." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  await audit(user.id, "update", "user", user.id, `${user.name} turned off two-step login`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Two-step login is off." };
}
