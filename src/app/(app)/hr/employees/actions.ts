"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addMonths, format } from "date-fns";
import { db } from "@/lib/db";
import { hashPassword, requireUser, type SessionUser } from "@/lib/auth";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { deleteUpload, saveImage, saveUpload } from "@/lib/files";
import { submitRequest } from "@/lib/approvals";
import { DOC_TYPES, EMPLOYMENT_TYPES, addEvent, employeeAllows, ensureChecklist, getSetting, nextEmployeeCode, syncUserFromEmployee } from "@/lib/hr";
import { str, type FormState } from "@/lib/utils";

const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const path = (id: string) => `/hr/employees/${id}`;

async function loadEditable(user: SessionUser, id: string) {
  const emp = await db.employee.findUnique({ where: { id }, include: { designation: true, department: true, branch: true, manager: true } });
  return emp && (await employeeAllows(user, emp, "edit")) ? emp : null;
}

const PERSONAL = [
  "fullName", "fatherName", "gender", "cnic", "maritalStatus", "bloodGroup", "phone", "personalEmail", "address", "city",
  "emergencyName", "emergencyRelation", "emergencyPhone", "bankName", "accountTitle", "accountNumber",
] as const;

function personalData(fd: FormData) {
  const out: Record<string, string | null> = {};
  for (const k of PERSONAL) out[k] = str(fd, k) || null;
  return out;
}

export async function saveEmployee(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("hr.employees", id ? "edit" : "create");
  const p = personalData(fd);
  if (!p.fullName || p.fullName.length < 2) return { error: "Full name is required." };
  if (p.cnic && !/^\d{5}-?\d{7}-?\d$/.test(p.cnic)) return { error: "CNIC should look like 42101-1234567-1." };
  const employmentType = EMPLOYMENT_TYPES.some((t) => t.value === str(fd, "employmentType")) ? str(fd, "employmentType") : "permanent";
  const common = { ...p, fullName: p.fullName, dob: date(fd, "dob"), cnicExpiry: date(fd, "cnicExpiry"), employmentType };

  if (id) {
    const emp = await loadEditable(user, id);
    if (!emp) return { error: "Employee not found or you can't edit them." };
    const joiningDate = date(fd, "joiningDate") ?? emp.joiningDate;
    await db.employee.update({ where: { id }, data: { ...common, joiningDate } });
    if (emp.userId && p.phone !== emp.phone) await db.user.update({ where: { id: emp.userId }, data: { phone: p.phone, name: p.fullName } });
    await audit(user.id, "update", "employee", id, `Updated employee ${p.fullName}`);
    revalidatePath(path(id));
    redirect(path(id));
  }

  // New hire
  const joiningDate = date(fd, "joiningDate");
  if (!joiningDate) return { error: "Joining date is required." };
  const months = Number(await getSetting("hr.probationMonths", "3")) || 0;

  // Login: link an existing user without an employee record, or create one with the Employee role.
  let userId: string | null = null;
  const link = str(fd, "linkUserId");
  if (link) {
    const free = await db.user.findFirst({ where: { id: link, employee: null }, select: { id: true } });
    if (!free) return { error: "That login is already linked to another employee." };
    userId = free.id;
  } else if (fd.get("createLogin") === "on") {
    if (!can(user, "settings.users", "create") && scopeFor(user, "hr.employees", "create") !== "all") return { error: "You can't create logins." };
    const email = str(fd, "loginEmail").toLowerCase();
    const password = str(fd, "loginPassword");
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid login email." };
    if (password.length < 8) return { error: "Login password must be at least 8 characters." };
    if (await db.user.findUnique({ where: { email } })) return { error: "A login with this email already exists — link it instead." };
    const employeeRole = await db.role.findUnique({ where: { name: "Employee" } });
    const created = await db.user.create({
      data: { name: p.fullName, email, phone: p.phone, passwordHash: await hashPassword(password), roles: employeeRole ? { create: { roleId: employeeRole.id } } : undefined },
    });
    userId = created.id;
  }

  const designationId = str(fd, "designationId") || null;
  const emp = await db.employee.create({
    data: {
      ...common, code: await nextEmployeeCode(), userId, joiningDate, status: months ? "probation" : "active",
      probationEnd: months ? addMonths(joiningDate, months) : null, confirmedAt: months ? null : joiningDate,
      departmentId: str(fd, "departmentId") || null, designationId, branchId: str(fd, "branchId") || null, managerId: str(fd, "managerId") || null,
    },
    include: { designation: true },
  });
  await addEvent(emp.id, "joined", `Joined${emp.designation ? ` as ${emp.designation.name}` : ""}`, { date: joiningDate, byId: user.id });
  await ensureChecklist(emp.id, "onboarding");
  await syncUserFromEmployee(emp.id);
  await audit(user.id, "create", "employee", emp.id, `Added employee ${emp.fullName} (${emp.code})`);
  revalidatePath("/hr/employees");
  redirect(path(emp.id));
}

/** Promotion / transfer / manager change — always recorded on the employee's history. */
export async function changeAssignment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await loadEditable(user, str(fd, "id"));
  if (!emp) return { error: "You can't change this employee." };
  const next = {
    designationId: str(fd, "designationId") || null, departmentId: str(fd, "departmentId") || null,
    branchId: str(fd, "branchId") || null, managerId: str(fd, "managerId") || null,
  };
  if (next.managerId === emp.id) return { error: "Someone can't report to themselves." };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== emp[k]);
  if (!changed.length) return { error: "Nothing changed." };

  const [desig, dept, branch, manager] = await Promise.all([
    next.designationId ? db.designation.findUnique({ where: { id: next.designationId } }) : null,
    next.departmentId ? db.department.findUnique({ where: { id: next.departmentId } }) : null,
    next.branchId ? db.branch.findUnique({ where: { id: next.branchId } }) : null,
    next.managerId ? db.employee.findUnique({ where: { id: next.managerId } }) : null,
  ]);
  const lines = [
    changed.includes("designationId") && `Designation: ${emp.designation?.name ?? "—"} → ${desig?.name ?? "—"}`,
    changed.includes("departmentId") && `Department: ${emp.department?.name ?? "—"} → ${dept?.name ?? "—"}`,
    changed.includes("branchId") && `Branch: ${emp.branch?.name ?? "—"} → ${branch?.name ?? "—"}`,
    changed.includes("managerId") && `Reports to: ${emp.manager?.fullName ?? "—"} → ${manager?.fullName ?? "—"}`,
  ].filter(Boolean) as string[];
  const type = changed.includes("designationId") ? "promoted" : "transferred";
  const title = type === "promoted" ? `Now ${desig?.name ?? "—"}` : changed.includes("branchId") ? `Transferred to ${branch?.name ?? "—"}` : "Assignment changed";

  await db.employee.update({ where: { id: emp.id }, data: next });
  await addEvent(emp.id, type, title, { date: date(fd, "effective") ?? new Date(), details: [lines.join("\n"), str(fd, "notes")].filter(Boolean).join("\n\n"), byId: user.id });
  await syncUserFromEmployee(emp.id);
  await audit(user.id, "update", "employee", emp.id, `${emp.fullName}: ${lines.join("; ")}`);
  revalidatePath(path(emp.id));
  redirect(`${path(emp.id)}?tab=history`);
}

export async function confirmEmployee(fd: FormData) {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await loadEditable(user, str(fd, "id"));
  if (!emp || emp.status !== "probation") return;
  await db.employee.update({ where: { id: emp.id }, data: { status: "active", confirmedAt: new Date() } });
  await addEvent(emp.id, "confirmed", "Confirmed after probation", { byId: user.id });
  await notify(emp.userId, "Your employment has been confirmed", { link: "/me", email: true });
  await audit(user.id, "update", "employee", emp.id, `Confirmed ${emp.fullName}`);
  revalidatePath(path(emp.id));
}

export async function recordResignation(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await loadEditable(user, str(fd, "id"));
  if (!emp || emp.status === "left") return { error: "You can't change this employee." };
  const exitType = ["resigned", "terminated", "other"].includes(str(fd, "exitType")) ? str(fd, "exitType") : "resigned";
  const noticeDate = date(fd, "noticeDate") ?? new Date();
  const lastWorkingDay = date(fd, "lastWorkingDay");
  if (!lastWorkingDay || lastWorkingDay < noticeDate) return { error: "Last working day must be on or after the notice date." };

  await db.employee.update({ where: { id: emp.id }, data: { status: "notice", exitType, noticeDate, lastWorkingDay, exitReason: str(fd, "reason") || null } });
  await addEvent(emp.id, "resigned", exitType === "terminated" ? "Termination notice" : exitType === "resigned" ? "Resigned" : "Leaving", {
    date: noticeDate, details: `Last working day ${format(lastWorkingDay, "d MMM yyyy")}${str(fd, "reason") ? `\n${str(fd, "reason")}` : ""}`, byId: user.id,
  });
  await ensureChecklist(emp.id, "offboarding");
  if (emp.manager?.userId) await notify(emp.manager.userId, `${emp.fullName} is leaving`, { body: `Last working day ${format(lastWorkingDay, "d MMM yyyy")}`, link: path(emp.id) });
  await audit(user.id, "update", "employee", emp.id, `Recorded exit notice for ${emp.fullName}`);
  revalidatePath(path(emp.id));
  redirect(`${path(emp.id)}?tab=checklist`);
}

/** Final exit: marks the employee as left and switches off their login. */
export async function completeExit(fd: FormData) {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await loadEditable(user, str(fd, "id"));
  if (!emp || emp.status !== "notice") return;
  const leftAt = emp.lastWorkingDay ?? new Date();
  await db.employee.update({ where: { id: emp.id }, data: { status: "left", leftAt } });
  if (emp.userId) {
    await db.user.update({ where: { id: emp.userId }, data: { active: false } });
    await db.session.deleteMany({ where: { userId: emp.userId } });
  }
  await addEvent(emp.id, "exited", "Left the company", { date: leftAt, details: emp.userId ? "Login disabled" : null, byId: user.id });
  await audit(user.id, "update", "employee", emp.id, `Completed exit for ${emp.fullName}`);
  revalidatePath(path(emp.id));
}

export async function rehireEmployee(fd: FormData) {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await loadEditable(user, str(fd, "id"));
  if (!emp || emp.status !== "left") return;
  await db.employee.update({
    where: { id: emp.id },
    data: { status: "probation", joiningDate: new Date(), probationEnd: addMonths(new Date(), Number(await getSetting("hr.probationMonths", "3")) || 3), confirmedAt: null, noticeDate: null, lastWorkingDay: null, exitType: null, exitReason: null, leftAt: null },
  });
  if (emp.userId) await db.user.update({ where: { id: emp.userId }, data: { active: true } });
  await db.checklistItem.deleteMany({ where: { employeeId: emp.id } });
  await ensureChecklist(emp.id, "onboarding");
  await addEvent(emp.id, "rehired", "Rehired", { byId: user.id });
  await audit(user.id, "update", "employee", emp.id, `Rehired ${emp.fullName}`);
  revalidatePath(path(emp.id));
}

export async function toggleChecklistItem(fd: FormData) {
  const user = await requirePermission("hr.employees", "edit");
  const item = await db.checklistItem.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
  if (!item || !(await employeeAllows(user, item.employee, "edit"))) return;
  await db.checklistItem.update({ where: { id: item.id }, data: item.doneAt ? { doneAt: null, doneById: null } : { doneAt: new Date(), doneById: user.id } });
  revalidatePath(path(item.employeeId));
}

export async function addEmployeeNote(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await loadEditable(user, str(fd, "id"));
  const note = str(fd, "note");
  if (!emp) return { error: "You can't edit this employee." };
  if (!note) return { error: "Write a note." };
  await addEvent(emp.id, "note", note.slice(0, 120), { details: note.length > 120 ? note : null, byId: user.id });
  revalidatePath(path(emp.id));
  return { ok: true };
}

/** HR uploads are verified straight away; an employee's own upload goes to HR for approval first. */
export async function uploadDocument(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") } });
  if (!emp) return { error: "Employee not found." };
  const isHr = can(user, "hr.employees", "edit") && (await employeeAllows(user, emp, "edit"));
  const isSelf = emp.userId === user.id;
  if (!isHr && !isSelf) return { error: "You can't add documents for this employee." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const type = DOC_TYPES.includes(str(fd, "type") as (typeof DOC_TYPES)[number]) ? str(fd, "type") : "Other";
  const res = await saveUpload(file, `hr/${emp.id}`, { maxBytes: 10_000_000, allowPdf: true });
  if ("error" in res) return { error: res.error };

  const doc = await db.employeeDocument.create({
    data: { employeeId: emp.id, type, title: str(fd, "title") || type, path: res.path, size: res.size, expiresAt: date(fd, "expiresAt"), verified: isHr, uploadedById: user.id },
  });
  if (!isHr) {
    await submitRequest({ type: "document", employeeId: emp.id, requesterId: user.id, title: `${emp.fullName}: ${doc.title}`, summary: `New ${type} uploaded for verification`, payload: { documentId: doc.id } });
  }
  revalidatePath(path(emp.id));
  revalidatePath("/me");
  return { ok: true, message: isHr ? "Document added." : "Uploaded — HR will verify it." };
}

export async function deleteDocument(fd: FormData) {
  const user = await requirePermission("hr.employees", "edit");
  const doc = await db.employeeDocument.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
  if (!doc || !(await employeeAllows(user, doc.employee, "edit"))) return;
  await deleteUpload(doc.path);
  await db.employeeDocument.delete({ where: { id: doc.id } });
  await audit(user.id, "delete", "employeeDocument", doc.id, `Removed ${doc.title} for ${doc.employee.fullName}`);
  revalidatePath(path(doc.employeeId));
}

export async function uploadPhoto(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.employees", "edit");
  const emp = await loadEditable(user, str(fd, "id"));
  const file = fd.get("photo");
  if (!emp) return { error: "You can't edit this employee." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const res = await saveImage(file, `people/${emp.id}`, 4_000_000);
  if ("error" in res) return { error: res.error };
  if (emp.photo) await deleteUpload(emp.photo);
  await db.employee.update({ where: { id: emp.id }, data: { photo: res.path } });
  revalidatePath(path(emp.id));
  return { ok: true };
}
