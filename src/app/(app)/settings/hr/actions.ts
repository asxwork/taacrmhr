"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import type { Step } from "@/lib/approvals";

/** HR configuration needs company-wide HR edit rights. */
async function requireHrAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.employees", "edit") !== "all") redirect("/no-access");
  return user;
}
const done = (message?: string): FormState => {
  revalidatePath("/settings/hr");
  return { ok: true, message };
};

export async function saveDepartment(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Department name is required." };
  const clash = await db.department.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };
  const data = { name, code: str(fd, "code") || null, headId: str(fd, "headId") || null, sortOrder: Number(str(fd, "sortOrder")) || 0, active: id ? fd.get("active") === "on" : true };
  if (id) await db.department.update({ where: { id }, data });
  else await db.department.create({ data });
  await audit(user.id, id ? "update" : "create", "department", id || null, `${id ? "Updated" : "Added"} department ${name}`);
  return done();
}

export async function saveDesignation(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Designation is required." };
  const clash = await db.designation.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };
  const data = { name, grade: str(fd, "grade") || null, active: id ? fd.get("active") === "on" : true };
  if (id) await db.designation.update({ where: { id }, data });
  else await db.designation.create({ data });
  await audit(user.id, id ? "update" : "create", "designation", id || null, `${id ? "Updated" : "Added"} designation ${name}`);
  return done();
}

export async function saveHrGeneral(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const prefix = str(fd, "codePrefix");
  const months = Math.round(Number(str(fd, "probationMonths")));
  if (!/^[A-Za-z0-9-]{1,10}$/.test(prefix)) return { error: "Code prefix: letters, numbers and dashes, up to 10." };
  if (!(months >= 0 && months <= 24)) return { error: "Probation must be 0–24 months." };
  const set = (key: string, value: string) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  await set("hr.codePrefix", prefix);
  await set("hr.probationMonths", String(months));
  for (const kind of ["onboarding", "offboarding"]) {
    const lines = str(fd, kind).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 40);
    await set(`hr.${kind}`, lines.join("\n"));
  }
  await audit(user.id, "update", "setting", "hr", "Updated HR settings");
  return done("Saved.");
}

export async function saveFlow(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const type = str(fd, "type");
  const flow = await db.approvalFlow.findUnique({ where: { type } });
  if (!flow) return { error: "Unknown approval type." };

  const steps: Step[] = [];
  for (let i = 0; i < 3; i++) {
    const v = str(fd, `step${i}`);
    if (v === "manager" || v === "hr") steps.push({ kind: v });
    else if (v.startsWith("user:")) {
      const userId = v.slice(5);
      if (await db.user.findFirst({ where: { id: userId, active: true }, select: { id: true } })) steps.push({ kind: "user", userId });
    }
  }
  if (!steps.length) return { error: "Add at least one approval step." };
  await db.approvalFlow.update({ where: { type }, data: { steps: JSON.stringify(steps), active: true } });
  await audit(user.id, "update", "approvalFlow", flow.id, `Approval flow for ${flow.name}: ${steps.length} step(s)`);
  return done(`${flow.name}: ${steps.length} step(s).`);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveShift(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const start = str(fd, "start");
  const end = str(fd, "end");
  if (!name) return { error: "Shift name is required." };
  if (!HHMM.test(start) || !HHMM.test(end) || end <= start) return { error: "Use 24-hour times with the end after the start (overnight shifts aren’t supported yet)." };
  const workDays = fd.getAll("workDays").map(String).filter((d) => /^[1-7]$/.test(d)).join(",");
  if (!workDays) return { error: "Pick at least one working day." };
  const graceMin = Math.max(0, Math.min(120, Math.round(Number(str(fd, "graceMin")) || 0)));
  const halfDayMin = Math.max(30, Math.min(720, Math.round((Number(str(fd, "halfDayHours")) || 4) * 60)));
  const clash = await db.shift.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };
  const isDefault = fd.get("isDefault") === "on";
  if (isDefault) await db.shift.updateMany({ data: { isDefault: false } });
  const data = { name, start, end, graceMin, halfDayMin, workDays, ...(isDefault && { isDefault }) };
  if (id) await db.shift.update({ where: { id }, data });
  else await db.shift.create({ data: { ...data, isDefault: isDefault || !(await db.shift.count()) } });
  await audit(user.id, id ? "update" : "create", "shift", id || null, `${id ? "Updated" : "Added"} shift ${name}`);
  return done();
}

export async function saveHoliday(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const date = new Date(`${str(fd, "date")}T00:00:00`);
  const name = str(fd, "name");
  if (Number.isNaN(date.getTime()) || !name) return { error: "Date and name are required." };
  await db.holiday.create({ data: { date, name, branchId: str(fd, "branchId") || null } });
  await audit(user.id, "create", "holiday", null, `Added holiday ${name} (${str(fd, "date")})`);
  return done();
}

export async function deleteHoliday(fd: FormData) {
  const user = await requireHrAdmin();
  const h = await db.holiday.findUnique({ where: { id: str(fd, "id") } });
  if (!h) return;
  await db.holiday.delete({ where: { id: h.id } });
  await audit(user.id, "delete", "holiday", h.id, `Removed holiday ${h.name}`);
  revalidatePath("/settings/hr");
}

export async function saveGeofence(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const mode = ["off", "warn", "enforce"].includes(str(fd, "mode")) ? str(fd, "mode") : "warn";
  await db.setting.upsert({ where: { key: "attendance.geofence" }, update: { value: mode }, create: { key: "attendance.geofence", value: mode } });
  const branches = await db.branch.findMany();
  for (const b of branches) {
    const lat = parseFloat(str(fd, `lat:${b.id}`));
    const lng = parseFloat(str(fd, `lng:${b.id}`));
    const radiusM = Math.round(Number(str(fd, `r:${b.id}`)) || b.radiusM);
    const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    await db.branch.update({ where: { id: b.id }, data: valid ? { lat, lng, radiusM: Math.max(30, Math.min(5000, radiusM)) } : { lat: null, lng: null } });
  }
  await audit(user.id, "update", "setting", "attendance.geofence", `Geo-fence ${mode}`);
  return done("Saved.");
}

export async function saveLeaveType(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHrAdmin();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const code = str(fd, "code").toUpperCase();
  if (!name || !code) return { error: "Name and short code are required." };
  const clash = await db.leaveType.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };
  const num = (k: string, max: number) => Math.max(0, Math.min(max, Number(str(fd, k)) || 0));
  const data = {
    name, code, color: str(fd, "color") || "blue", paid: fd.get("paid") === "on", quota: num("quota", 366),
    accrual: str(fd, "accrual") === "monthly" ? "monthly" : "annual", carryMax: num("carryMax", 366), halfDay: fd.get("halfDay") === "on",
    gender: ["male", "female"].includes(str(fd, "gender")) ? str(fd, "gender") : null, minServiceMonths: Math.round(num("minServiceMonths", 60)),
    encashable: fd.get("encashable") === "on",
    active: id ? fd.get("active") === "on" : true,
  };
  if (id) await db.leaveType.update({ where: { id }, data });
  else await db.leaveType.create({ data: { ...data, sortOrder: await db.leaveType.count() } });
  await audit(user.id, id ? "update" : "create", "leaveType", id || null, `${id ? "Updated" : "Added"} leave type ${name}`);
  return done();
}
