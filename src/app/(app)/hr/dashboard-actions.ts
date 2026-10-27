"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { hrApproverIds } from "@/lib/approvals";
import { str, type FormState } from "@/lib/utils";

const KINDS = ["accolade", "news", "wisdom"] as const;

/** Accolades, newsletter items and words of wisdom on the HR dashboard. Accolades notify the employee. */
export async function addHrPost(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, "hr.employees", "edit")) return { error: "Only HR can post here." };
  const kind = str(fd, "kind") as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) return { error: "Unknown post type." };
  const title = str(fd, "title").slice(0, 200);
  if (!title) return { error: kind === "wisdom" ? "Write the quote." : "Add a title." };
  const employeeId = kind === "accolade" ? str(fd, "employeeId") || null : null;
  const emp = employeeId ? await db.employee.findUnique({ where: { id: employeeId }, select: { userId: true, fullName: true } }) : null;
  if (kind === "accolade" && !emp) return { error: "Choose who the accolade is for." };
  await db.hrPost.create({ data: { kind, title, body: str(fd, "body").slice(0, 2000) || null, employeeId, createdById: user.id } });
  if (emp?.userId) await notify(emp.userId, `🏆 ${title}`, { body: `An accolade from ${user.name}`, link: "/hr" });
  revalidatePath("/hr");
  return { ok: true, message: "Posted." };
}

export async function deleteHrPost(fd: FormData) {
  const user = await requireUser();
  if (!can(user, "hr.employees", "edit")) return;
  await db.hrPost.deleteMany({ where: { id: str(fd, "id") } });
  revalidatePath("/hr");
}

/** "Support Email" widget: sends the message to everyone who handles HR, by notification and email. */
export async function sendHrSupport(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const subject = str(fd, "subject").slice(0, 150);
  const message = str(fd, "message").slice(0, 4000);
  if (!subject || !message) return { error: "Add a subject and a message." };
  const to = (await hrApproverIds()).filter((id) => id !== user.id);
  for (const id of to) await notify(id, `Support: ${subject}`, { body: `${user.name} (${user.email}): ${message}`, link: "/hr", email: true });
  return { ok: true, message: to.length ? `Sent to HR (${to.length}).` : "No HR users to send to yet." };
}
