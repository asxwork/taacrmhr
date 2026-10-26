"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "@/lib/rate-limit";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email || !password) return { error: "Enter your email and password." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const wait = loginBlockedFor(email, ip);
  if (wait) return { error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure(email, ip);
    if (user) await audit(user.id, "login_failed", "user", user.id, `Failed sign-in for ${email} from ${ip}`);
    return { error: "Incorrect email or password." };
  }
  clearLoginFailures(email);

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.id, "login", "user", user.id, `${user.name} signed in`);
  redirect("/home");
}

export async function logout() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit(user.id, "logout", "user", user.id, `${user.name} signed out`);
  redirect("/login");
}
