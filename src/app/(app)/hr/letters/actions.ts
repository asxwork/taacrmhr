"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { employeeAllows } from "@/lib/hr";
import { LETTER_CATEGORIES } from "@/lib/letters";
import { str, type FormState } from "@/lib/utils";

const hr = (u: SessionUser) => can(u, "hr.employees", "edit");

export async function saveTemplate(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!hr(user)) return { error: "Only HR can edit letter templates." };
  const name = str(fd, "name").slice(0, 120);
  const body = str(fd, "body").slice(0, 30_000);
  if (!name || !body) return { error: "Name and text are required." };
  const category = LETTER_CATEGORIES.some((c) => c.value === str(fd, "category")) ? str(fd, "category") : "other";
  const id = str(fd, "id");
  if (id) await db.letterTemplate.update({ where: { id }, data: { name, body, category } });
  else await db.letterTemplate.create({ data: { name, body, category } });
  await audit(user.id, id ? "update" : "create", "letterTemplate", id || name, `Letter template ${name}`);
  revalidatePath("/hr/letters");
  redirect("/hr/letters?tab=templates");
}

export async function toggleTemplate(fd: FormData) {
  const user = await requireUser();
  if (!hr(user)) return;
  const t = await db.letterTemplate.findUnique({ where: { id: str(fd, "id") } });
  if (t) await db.letterTemplate.update({ where: { id: t.id }, data: { active: !t.active } });
  revalidatePath("/hr/letters");
}

/** Saves the (possibly edited) letter on the employee's record; they see it under My Documents. */
export async function issueLetter(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!hr(user)) return { error: "Only HR can issue letters." };
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") } });
  if (!emp || !(await employeeAllows(user, emp, "edit"))) return { error: "Choose an employee you manage." };
  const title = str(fd, "title").slice(0, 160);
  const body = str(fd, "body").slice(0, 30_000);
  if (!title || !body) return { error: "Title and text are required." };
  if (/\{\{\s*\w+\s*\}\}/.test(body.replace(/\{\{\s*(today|issuer)\s*\}\}/g, ""))) return { error: "Some {{placeholders}} are still in the text. Fill them in or remove them." };
  const letter = await db.employeeLetter.create({ data: { employeeId: emp.id, templateId: str(fd, "templateId") || null, title, body, issuedById: user.id } });
  await db.employeeEvent.create({ data: { employeeId: emp.id, type: "note", date: new Date(), title: `Letter issued: ${title}`, byId: user.id } });
  if (emp.userId) await notify(emp.userId, `New letter: ${title}`, { link: `/print/letter/${letter.id}` });
  await audit(user.id, "create", "employeeLetter", letter.id, `Issued ${title} to ${emp.fullName}`);
  revalidatePath("/hr/letters");
  revalidatePath(`/hr/employees/${emp.id}`);
  redirect(`/hr/letters?tab=issued&issued=${letter.id}`);
}

export async function deleteLetter(fd: FormData) {
  const user = await requireUser();
  if (!hr(user)) return;
  const l = await db.employeeLetter.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
  if (!l || !(await employeeAllows(user, l.employee, "edit"))) return;
  await db.employeeLetter.delete({ where: { id: l.id } });
  await audit(user.id, "delete", "employeeLetter", l.id, `Deleted letter ${l.title} (${l.employee.fullName})`);
  revalidatePath("/hr/letters");
}
