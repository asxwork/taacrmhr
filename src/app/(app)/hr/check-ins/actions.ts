"use server";

import { revalidatePath } from "next/cache";
import { format, parse } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePermission, scopeMatcher } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { disabledFeatures } from "@/lib/features";
import { str, type FormState } from "@/lib/utils";

const monthOk = (m: string) => /^\d{4}-\d{2}$/.test(m);
const txt = (fd: FormData, k: string) => str(fd, k).slice(0, 3000) || null;

/** The employee fills in their side: how the month went, wins, blockers and goals. */
export async function saveMyCheckIn(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if ((await disabledFeatures()).has("checkins")) return { error: "Check-ins are switched off." };
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, fullName: true, manager: { select: { userId: true } } } });
  const month = str(fd, "month");
  if (!emp || !monthOk(month)) return { error: "Your login isn't linked to an employee record." };
  const mood = Number(str(fd, "mood")) || null;
  const data = { mood: mood && mood >= 1 && mood <= 5 ? mood : null, wins: txt(fd, "wins"), blockers: txt(fd, "blockers"), goals: txt(fd, "goals") };
  const before = await db.checkIn.findUnique({ where: { employeeId_month: { employeeId: emp.id, month } } });
  await db.checkIn.upsert({ where: { employeeId_month: { employeeId: emp.id, month } }, update: data, create: { employeeId: emp.id, month, ...data } });
  if (!before?.wins && !before?.goals) await notify(emp.manager?.userId, `${emp.fullName} filled in their ${format(parse(month, "yyyy-MM", new Date()), "MMMM")} check-in`, { link: `/hr/check-ins?m=${month}&open=${emp.id}` });
  revalidatePath("/me/check-ins");
  return { ok: true, message: "Saved — your manager can see it." };
}

/** The manager's notes and agreed goals for the month. */
export async function saveManagerCheckIn(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.checkins", "edit");
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") }, select: { id: true, userId: true, branchId: true } });
  const month = str(fd, "month");
  if (!emp || !monthOk(month) || !(await scopeMatcher(user, "hr.checkins", "edit"))({ ownerId: emp.userId, branchId: emp.branchId })) return { error: "You can't write a check-in for this person." };
  const data = { managerNotes: txt(fd, "managerNotes"), goals: txt(fd, "goals"), managerId: user.id };
  await db.checkIn.upsert({ where: { employeeId_month: { employeeId: emp.id, month } }, update: data, create: { employeeId: emp.id, month, ...data } });
  await notify(emp.userId, `${user.name} added notes to your ${format(parse(month, "yyyy-MM", new Date()), "MMMM")} check-in`, { link: "/me/check-ins" });
  revalidatePath("/hr/check-ins");
  return { ok: true, message: "Check-in saved." };
}
