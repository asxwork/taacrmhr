"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "@/lib/rate-limit";
import { openSecret, sealSecret } from "@/lib/softphone";
import { spendRecoveryCode, verifyTotp } from "@/lib/totp";
import { describeWindow, insideWindow, windowFromRoles } from "@/lib/security";
import { explainDbError } from "@/lib/db-diagnose";
import { recordSignIn } from "@/lib/login-alerts";
import { resolveLoginEmail } from "@/lib/login-name";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const typed = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!typed || !password) return { error: "Enter your username (or email) and password." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const wait = loginBlockedFor(typed, ip);
  if (wait) return { error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };

  // A database problem shows its real cause here instead of a blank error page.
  try {
    // "admin", "huzaifa.khan" or "Huzaifa Khan" work as well as the full email.
    const email = (await resolveLoginEmail(typed)) ?? typed;
    const wait2 = email !== typed ? loginBlockedFor(email, ip) : 0;
    if (wait2) return { error: `Too many failed attempts. Try again in ${wait2} minute${wait2 === 1 ? "" : "s"}.` };
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      if (typed !== email) recordLoginFailure(typed, ip);
      recordLoginFailure(email, ip);
      if (user) await audit(user.id, "login_failed", "user", user.id, `Failed sign-in for ${email} from ${ip}`);
      return { error: "Incorrect username or password." };
    }
    // Two-step login: a 6-digit authenticator code after the password.
    if (user.totpEnabled) {
      const code = str(fd, "code");
      if (!code) return { needCode: true, message: "Enter the 6-digit code from your authenticator app." };
      const secret = openSecret(user.totpSecret);
      // A backup code (lost phone) works once instead of the app's code.
      const left = !(secret && verifyTotp(secret, code)) && code.replace(/[^A-Za-z0-9]/g, "").length === 8
        ? spendRecoveryCode((openSecret(user.totpRecovery ?? null) ?? "").split(",").filter(Boolean), code) : null;
      if (left) {
        await db.user.update({ where: { id: user.id }, data: { totpRecovery: left.length ? sealSecret(left.join(",")) : null } });
        await audit(user.id, "login", "user", user.id, `${user.name} used a two-step backup code (${left.length} left)`);
      } else if (!secret || !verifyTotp(secret, code)) {
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
    clearLoginFailures(typed);

    await createSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, "login", "user", user.id, `${user.name} signed in`);
    await recordSignIn(user, h.get("user-agent") ?? "", ip).catch(() => {}); // new-device alert; never blocks sign-in
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

// Same answer whether or not the email has an account (nobody can test which emails exist).
const RESET_MSG = "If that email has an account, a link to choose a new password is on its way (valid 1 hour). No email? Your administrator has been asked to help.";

/** "Forgot password?": tells the Super Admins someone asked for a reset. Same answer whether or not the email exists. */
export async function requestPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter your work email." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (loginBlockedFor(`reset:${email}`, ip)) return { ok: true, message: RESET_MSG };
  recordLoginFailure(`reset:${email}`, ip); // counts requests, so the same email can't flood the admins
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (user?.active) {
      // Email them a reset link; only when the email can't go out (not set up, testing mode) do the admins get the request.
      const { sendResetEmail } = await import("@/lib/invites");
      if (await sendResetEmail(user)) { await audit(user.id, "password_reset_request", "user", user.id, `Reset link emailed (${ip})`); return { ok: true, message: RESET_MSG }; }
      const { notify } = await import("@/lib/notify");
      const admins = await db.user.findMany({ where: { isSuperAdmin: true, active: true }, select: { id: true } });
      for (const a of admins) await notify(a.id, `Password reset requested: ${user.name}`, { body: `${email} asked for a new password from the sign-in page.`, link: `/settings/users?edit=${user.id}`, email: true });
      await audit(user.id, "password_reset_request", "user", user.id, `Asked for a password reset from ${ip}`);
    }
  } catch {}
  return { ok: true, message: RESET_MSG };
}
