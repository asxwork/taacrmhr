"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "@/lib/rate-limit";
import { openSecret } from "@/lib/softphone";
import { verifyTotp } from "@/lib/totp";
import { describeWindow, insideWindow, windowFromRoles } from "@/lib/security";
import { explainDbError } from "@/lib/db-diagnose";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email || !password) return { error: "Enter your email and password." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const wait = loginBlockedFor(email, ip);
  if (wait) return { error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };

  // A database problem shows its real cause here instead of a blank error page.
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      recordLoginFailure(email, ip);
      if (user) await audit(user.id, "login_failed", "user", user.id, `Failed sign-in for ${email} from ${ip}`);
      return { error: "Incorrect email or password." };
    }
    // Two-step login: a 6-digit authenticator code after the password.
    if (user.totpEnabled) {
      const code = str(fd, "code");
      if (!code) return { needCode: true, message: "Enter the 6-digit code from your authenticator app." };
      const secret = openSecret(user.totpSecret);
      if (!secret || !verifyTotp(secret, code)) {
        recordLoginFailure(email, ip);
        await audit(user.id, "login_failed", "user", user.id, `Wrong two-step code for ${email} from ${ip}`);
        return { needCode: true, error: "That code didn't work. Check the time on your phone and try the newest code." };
      }
    }
    // Role sign-in hours.
    if (!user.isSuperAdmin) {
      const roles = await db.role.findMany({ where: { users: { some: { userId: user.id } } }, select: { loginFrom: true, loginTo: true, loginDays: true } });
      const w = windowFromRoles(roles);
      if (w && !insideWindow(w)) return { error: `Sign-in is allowed ${describeWindow(w)} for your role.` };
    }
    clearLoginFailures(email);

    await createSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, "login", "user", user.id, `${user.name} signed in`);
  } catch (e) {
    const x = explainDbError(e);
    console.error("[login] database error", x.code);
    return { error: `Can't sign in right now: ${x.meaning} (code ${x.code}). Open /api/status for details.` };
  }
  redirect("/home");
}

export async function logout() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit(user.id, "logout", "user", user.id, `${user.name} signed out`);
  redirect("/login");
}
