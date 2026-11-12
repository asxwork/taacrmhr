"use server";

import { randomBytes } from "node:crypto";
import { addDays, max } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { addEvent, nextEmployeeCode } from "@/lib/hr";
import { deleteUpload } from "@/lib/files";
import { ONB_FIELDS, onbStatus } from "@/lib/onboarding";
import { str, type FormState } from "@/lib/utils";

/** Create a link for an existing employee, or create the employee from just a first and last name. */
export async function createInvite(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.onboarding", "create");
  let emp: { id: string; fullName: string } | null = null;
  if (str(fd, "mode") === "new") {
    const firstName = str(fd, "firstName").slice(0, 60), lastName = str(fd, "lastName").slice(0, 60);
    if (!firstName || !lastName) return { error: "Enter the first and last name." };
    const fullName = `${firstName} ${lastName}`;
    emp = await db.employee.create({ data: { code: await nextEmployeeCode(), firstName, lastName, fullName, joiningDate: new Date(), status: "probation" }, select: { id: true, fullName: true } });
    await addEvent(emp.id, "joined", "Added from Onboarding links", { byId: user.id });
  } else {
    emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") }, select: { id: true, fullName: true } });
    if (!emp) return { error: "Choose an employee." };
  }
  await db.onboardingInvite.updateMany({ where: { employeeId: emp.id, status: { in: ["open", "rejected"] } }, data: { expiresAt: new Date() } });
  await db.onboardingInvite.create({ data: { employeeId: emp.id, token: randomBytes(24).toString("base64url"), expiresAt: addDays(new Date(), 14), createdById: user.id } });
  await audit(user.id, "create", "onboarding", emp.id, `Onboarding link for ${emp.fullName}`);
  revalidatePath("/hr/onboarding");
  return { ok: true, message: `Link created for ${emp.fullName}: copy it or send it on WhatsApp.` };
}

/**
 * HR checks what the new hire sent. Approve → it goes onto their profile. Send back → the same link opens again with
 * the wrong fields marked, for 14 more days.
 */
export async function reviewOnboarding(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.onboarding", "edit");
  const inv = await db.onboardingInvite.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
  if (!inv || onbStatus(inv) !== "submitted" || !inv.payload) return { error: "Nothing to review." };
  const p = JSON.parse(inv.payload) as Record<string, string>;

  if (str(fd, "op") === "reject") {
    const wrong = fd.getAll("wrong").map(String).filter((k) => ONB_FIELDS.some((f) => f.key === k));
    const note = str(fd, "note").slice(0, 500);
    if (!wrong.length && !note) return { error: "Tick the wrong fields or write what to fix." };
    await db.onboardingInvite.update({ where: { id: inv.id }, data: { status: "rejected", wrongFields: wrong.join(",") || null, reviewNote: note || null, reviewedById: user.id, reviewedAt: new Date(), expiresAt: max([inv.expiresAt, addDays(new Date(), 14)]) } });
    await audit(user.id, "update", "onboarding", inv.employeeId, `Onboarding sent back to ${inv.employee.fullName}: ${wrong.join(", ") || note}`);
    revalidatePath("/hr/onboarding");
    return { ok: true, message: "Sent back. Send them the same link again so they can fix it." };
  }

  if (str(fd, "op") !== "approve") return { error: "Choose Approve or Send back." };
  // Approve: copy the details onto the profile.
  const data: Record<string, unknown> = {};
  for (const f of ONB_FIELDS) {
    if (f.kind === "file") continue;
    data[f.key] = f.kind === "date" ? (p[f.key] ? new Date(`${p[f.key]}T00:00:00`) : null) : p[f.key] || null;
  }
  data.fullName = [p.firstName, p.lastName].filter(Boolean).join(" ");
  if (p.photo) {
    if (inv.employee.photo && inv.employee.photo !== p.photo) await deleteUpload(inv.employee.photo).catch(() => {});
    data.photo = p.photo;
  }
  await db.employee.update({ where: { id: inv.employeeId }, data: data as never });
  for (const [k, type] of [["cnicFront", "CNIC (front)"], ["cnicBack", "CNIC (back)"]] as const) {
    if (p[k] && !(await db.employeeDocument.findUnique({ where: { path: p[k] } }))) {
      await db.employeeDocument.create({ data: { employeeId: inv.employeeId, type, title: type, path: p[k], size: Number(p[`${k}Size`]) || 0, verified: true, uploadedById: user.id } });
    }
  }
  if (inv.employee.userId && p.phone) await db.user.update({ where: { id: inv.employee.userId }, data: { name: String(data.fullName), phone: p.phone } }).catch(() => {});
  await db.onboardingInvite.update({ where: { id: inv.id }, data: { status: "approved", reviewedById: user.id, reviewedAt: new Date(), wrongFields: null } });
  await addEvent(inv.employeeId, "note", "Onboarding details approved by HR", { byId: user.id });
  await audit(user.id, "update", "onboarding", inv.employeeId, `Onboarding approved for ${data.fullName}`);
  revalidatePath("/hr/onboarding");
  redirect("/hr/onboarding?s=approved");
}
