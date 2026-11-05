"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { findPasswordToken } from "@/lib/invites";
import { str, type FormState } from "@/lib/utils";

export async function setPassword(_: FormState, fd: FormData): Promise<FormState> {
  const row = await findPasswordToken(str(fd, "token"));
  if (!row) return { error: "This link has expired or was already used. Ask your administrator for a new one." };
  const password = fd.get("password");
  if (typeof password !== "string" || password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== fd.get("confirm")) return { error: "The two passwords don't match." };

  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password) } }),
    db.passwordToken.deleteMany({ where: { userId: row.userId } }),
    db.session.deleteMany({ where: { userId: row.userId } }), // old sign-ins end when the password changes
  ]);
  await audit(row.userId, "update", "user", row.userId, `${row.user.name} set their password from an emailed link`);
  redirect("/login?password=set");
}
