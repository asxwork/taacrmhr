"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { addEvent, employeeAllows, syncUserFromEmployee } from "@/lib/hr";
import { applyAssignment } from "@/lib/hr-assign";
import { recordRevision } from "@/lib/compensation";
import { customSection, profileSection, type ProfileField } from "@/lib/profile-fields";
import { str, type FormState } from "@/lib/utils";

const path = (id: string) => `/hr/employees/${id}`;

async function editable(user: SessionUser, id: string) {
  if (!can(user, "hr.employees", "edit")) return null;
  const emp = await db.employee.findUnique({ where: { id }, include: { designation: true, department: true, branch: true, manager: true, salary: true } });
  return emp && (await employeeAllows(user, emp, "edit")) ? emp : null;
}

const canPayroll = (user: SessionUser) => user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";

/** Reads and validates one section's fields; returns typed values keyed by field, or an error. */
function readFields(fields: ProfileField[], fd: FormData): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.readOnly) continue;
    if (f.kind === "bool") { data[f.key] = fd.get(f.key) === "on"; continue; }
    const v = str(fd, f.key);
    if (f.required && !v) return { error: `${f.label} is required.` };
    if (!v) { data[f.key] = null; continue; }
    if (f.kind === "date") {
      const d = new Date(`${v}T00:00:00`);
      if (Number.isNaN(d.getTime())) return { error: `${f.label}: invalid date.` };
      data[f.key] = d;
    } else if (f.kind === "number") {
      const n = parseFloat(v.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) return { error: `${f.label} must be a number.` };
      data[f.key] = n;
    } else if (f.kind === "email" && !/^\S+@\S+\.\S+$/.test(v)) {
      return { error: `${f.label}: enter a valid email.` };
    } else if (f.kind === "select" && f.options && !f.options.some(([o]) => o === v)) {
      return { error: `${f.label}: choose from the list.` };
    } else {
      data[f.key] = v.slice(0, 500);
    }
  }
  return { data };
}

/** Saves one section of the profile (Personal Information, CNIC, Employment, Salary…). */
export async function saveProfileSection(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const section = str(fd, "section") === "custom" ? customSection(await db.customField.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })) : profileSection(str(fd, "section"));
  if (!section) return { error: "Unknown section." };
  const emp = await editable(user, id);
  if (!emp) return { error: "You can't edit this employee." };
  const read = readFields(section.fields, fd);
  if ("error" in read) return read;
  const v = read.data;

  switch (section.key) {
    case "personal": {
      const fullName = [v.firstName, v.middleName, v.lastName].filter(Boolean).join(" ");
      await db.employee.update({ where: { id }, data: { ...v, fullName } as never });
      if (emp.userId && fullName !== emp.fullName) await db.user.update({ where: { id: emp.userId }, data: { name: fullName } });
      break;
    }
    case "cnic":
      if (v.cnic && !/^\d{5}-?\d{7}-?\d$/.test(String(v.cnic))) return { error: "CNIC should look like 42101-1234567-1." };
      await db.employee.update({ where: { id }, data: v as never });
      break;
    case "quick":
    case "contact":
      await db.employee.update({ where: { id }, data: v as never });
      if (emp.userId && v.phone !== undefined && v.phone !== emp.phone) await db.user.update({ where: { id: emp.userId }, data: { phone: (v.phone as string | null) ?? null } });
      break;
    case "employment": {
      const { branchId, departmentId, designationId, managerId, deviceUserId, ...rest } = v as Record<string, string | null> & Record<string, unknown>;
      if (v.finalAuthorityId === id) return { error: "Someone can't be their own final authority." };
      if (deviceUserId && !/^\d{1,9}$/.test(deviceUserId)) return { error: "Attendance machine ID is a number (the user ID on the device)." };
      if (deviceUserId && (await db.employee.findFirst({ where: { deviceUserId, NOT: { id } } }))) return { error: "Another employee already has that machine ID." };
      try {
        await applyAssignment(emp, { branchId, departmentId, designationId, managerId }, { byId: user.id });
      } catch (e) {
        return { error: (e as Error).message };
      }
      await db.employee.update({ where: { id }, data: { ...rest, deviceUserId } as never });
      if (rest.shiftId !== undefined) await syncUserFromEmployee(id);
      break;
    }
    case "salary": {
      if (!canPayroll(user)) return { error: "Only payroll admins can change salary." };
      const { ntn, incrementMonths, ...sal } = v as Record<string, unknown>;
      const pfPct = Number(sal.pfPct ?? 0);
      if (pfPct > 20) return { error: "Provident fund must be 0–20%." };
      const data = {
        gross: sal.gross as number, probationGross: (sal.probationGross as number | null) ?? null, effectiveFrom: sal.effectiveFrom as Date,
        paymentMethod: (sal.paymentMethod as string | null) ?? "bank", incrementMonths: Number(incrementMonths ?? 12) || 12,
        nextIncrementAt: (sal.nextIncrementAt as Date | null) ?? null, taxExempt: !!sal.taxExempt, eobi: !!sal.eobi, pfPct,
      };
      await db.salaryProfile.upsert({ where: { employeeId: id }, update: data, create: { employeeId: id, ...data } });
      await db.employee.update({ where: { id }, data: { ntn: (ntn as string | null) ?? null } });
      if (emp.salary && emp.salary.gross !== data.gross) {
        await addEvent(id, "note", `Salary changed: ${emp.salary.gross.toLocaleString("en-PK")} → ${data.gross.toLocaleString("en-PK")}`, { date: data.effectiveFrom, byId: user.id });
        await recordRevision({ employeeId: id, oldGross: emp.salary.gross, newGross: data.gross, effectiveFrom: data.effectiveFrom, kind: data.gross > emp.salary.gross ? "adjustment" : "decrement", reason: "Edited on the profile", actorId: user.id });
      }
      break;
    }
    case "custom": {
      // Custom field values live as JSON on the employee, keyed by field id (kept for hidden fields too).
      let data: Record<string, unknown> = {};
      try { data = emp.customData ? JSON.parse(emp.customData) : {}; } catch {}
      for (const [k, val] of Object.entries(v)) data[k.replace(/^cf_/, "")] = val instanceof Date ? val.toISOString().slice(0, 10) : val == null ? "" : String(val);
      await db.employee.update({ where: { id }, data: { customData: JSON.stringify(data) } });
      break;
    }
    default:
      await db.employee.update({ where: { id }, data: v as never });
  }
  await audit(user.id, "update", "employee", id, `${emp.fullName}: ${section.title} updated`);
  revalidatePath(path(id));
  return { ok: true, message: `${section.title} saved.` };
}

const dateOrNull = (fd: FormData, k: string) => {
  const v = str(fd, k);
  const d = v ? new Date(`${v}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export async function addRelative(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  if (!(await editable(user, id))) return { error: "You can't edit this employee." };
  const name = str(fd, "name");
  const relation = str(fd, "relation");
  if (!name || !relation) return { error: "Name and relation are required." };
  const emergency = fd.get("emergency") === "on";
  await db.employeeRelative.create({
    data: { employeeId: id, name, relation, dob: dateOrNull(fd, "dob"), cnic: str(fd, "cnic") || null, phone: str(fd, "phone") || null, dependent: fd.get("dependent") === "on", emergency },
  });
  // The emergency relative becomes the profile's emergency contact.
  if (emergency) await db.employee.update({ where: { id }, data: { emergencyName: name, emergencyRelation: relation, emergencyPhone: str(fd, "phone") || null } });
  revalidatePath(path(id));
  return { ok: true, message: "Relative added." };
}

export async function addQualification(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  if (!(await editable(user, id))) return { error: "You can't edit this employee." };
  const kind = str(fd, "kind");
  if (!["experience", "education", "certification"].includes(kind)) return { error: "Choose a type." };
  const title = str(fd, "title");
  if (!title) return { error: kind === "experience" ? "Job title is required." : "Title is required." };
  const from = dateOrNull(fd, "from");
  const to = dateOrNull(fd, "to");
  if (from && to && to < from) return { error: "The end date is before the start date." };
  await db.employeeQualification.create({
    data: { employeeId: id, kind, title, institution: str(fd, "institution") || null, from, to, grade: str(fd, "grade") || null, notes: str(fd, "notes") || null },
  });
  revalidatePath(path(id));
  return { ok: true, message: "Added." };
}

/** Adds a salary account; the latest effective one is what payroll pays into. */
export async function addBank(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  if (!(await editable(user, id))) return { error: "You can't edit this employee." };
  const bankName = str(fd, "bankName");
  const accountNumber = str(fd, "accountNumber");
  if (!bankName || !accountNumber) return { error: "Bank and account number are required." };
  await db.employeeBank.create({
    data: {
      employeeId: id, bankName, accountNumber, accountTitle: str(fd, "accountTitle") || null, branchName: str(fd, "branchName") || null,
      branchCode: str(fd, "branchCode") || null, effectiveFrom: dateOrNull(fd, "effectiveFrom") ?? new Date(),
    },
  });
  await syncPrimaryBank(id);
  revalidatePath(path(id));
  return { ok: true, message: "Bank account added." };
}

async function syncPrimaryBank(employeeId: string) {
  const latest = await db.employeeBank.findFirst({ where: { employeeId, effectiveFrom: { lte: new Date() } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  if (latest) await db.employee.update({ where: { id: employeeId }, data: { bankName: latest.bankName, accountTitle: latest.accountTitle, accountNumber: latest.accountNumber } });
}

/** Removes a relative, qualification or bank row. */
export async function deleteProfileRow(fd: FormData) {
  const user = await requireUser();
  const kind = str(fd, "kind");
  const rowId = str(fd, "rowId");
  const row = kind === "relative" ? await db.employeeRelative.findUnique({ where: { id: rowId } })
    : kind === "qualification" ? await db.employeeQualification.findUnique({ where: { id: rowId } })
    : kind === "bank" ? await db.employeeBank.findUnique({ where: { id: rowId } }) : null;
  if (!row || !(await editable(user, row.employeeId))) return;
  if (kind === "relative") await db.employeeRelative.delete({ where: { id: rowId } });
  if (kind === "qualification") await db.employeeQualification.delete({ where: { id: rowId } });
  if (kind === "bank") {
    await db.employeeBank.delete({ where: { id: rowId } });
    await syncPrimaryBank(row.employeeId);
  }
  revalidatePath(path(row.employeeId));
}
