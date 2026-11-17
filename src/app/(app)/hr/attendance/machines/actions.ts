"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { syncPullMachine } from "@/lib/attendance-machine";
import { applyMachineLogs, autoMapMachineUsers, storeMachineLogs } from "@/lib/machine-users";
import { canStoreSecrets, sealSecret } from "@/lib/softphone";
import { str, type FormState } from "@/lib/utils";
import { MACHINE_TIME_ZONES as TIME_ZONES } from "@/lib/attendance-shared";

const admin = async () => {
  const user = await requireUser();
  return user.isSuperAdmin || scopeFor(user, "hr.attendance", "edit") === "all" ? user : null;
};

/** Approve, block or rename a machine (HR with company-wide attendance edit rights). */
export async function updateMachine(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.attendance", "edit") !== "all") return;
  const m = await db.attendanceMachine.findUnique({ where: { id: str(fd, "id") } });
  if (!m) return;
  const status = ["approved", "blocked", "pending"].includes(str(fd, "status")) ? str(fd, "status") : m.status;
  const name = fd.has("name") ? str(fd, "name").slice(0, 80) || null : m.name;
  await db.attendanceMachine.update({ where: { id: m.id }, data: { status, name } });
  if (status !== m.status) await audit(user.id, "update", "attendanceMachine", m.id, `Machine ${m.serial} ${status}`);
  revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
}

/** Super Admin: forget a machine (it reappears as pending if it calls in again). */
export async function deleteMachine(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const m = await db.attendanceMachine.findUnique({ where: { id: str(fd, "id") } });
  if (!m) return;
  await db.attendanceMachine.delete({ where: { id: m.id } });
  await audit(user.id, "delete", "attendanceMachine", m.id, `Machine ${m.serial} removed`);
  revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
}

/** Adds a machine AMS connects to directly (public IP / domain and port, usually 4370) and tests it straight away. */
export async function addPullMachine(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only HR with company-wide attendance access can add machines." };
  const host = str(fd, "host").replace(/^\w+:\/\//, "").replace(/[/:].*$/, "").slice(0, 120);
  const port = Number(str(fd, "port")) || 4370;
  if (!/^[\w.-]+$/.test(host)) return { error: "Enter the machine's public IP address or domain." };
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost$)/.test(host)) return { error: "That is an office-only (private) address. Use the office's public IP with port forwarding to the machine." };
  if (port < 1 || port > 65535) return { error: "Port must be between 1 and 65535." };
  const key = commKeyField(fd);
  if ("error" in key) return key;
  const serial = `${host}:${port}`;
  const m = await db.attendanceMachine.upsert({
    where: { serial }, update: { host, port, mode: "pull", ...(key.value !== undefined ? { commKeyEnc: key.value } : {}) },
    create: { serial, host, port, mode: "pull", status: "approved", name: str(fd, "name").slice(0, 80) || null, commKeyEnc: key.value ?? null },
  });
  await audit(user.id, "create", "attendanceMachine", m.id, `Direct machine ${serial} added`);
  const res = await syncPullMachine(m.id);
  revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
  return "error" in res ? { error: `Saved, but: ${res.error}` } : { ok: true, message: `Connected. Read ${res.read} punch(es), ${res.added} new${res.unknown ? `, ${res.unknown} machine ID(s) not linked to employees` : ""}.` };
}

/** Comm Key from the form: undefined = not given, null = 0 / none, otherwise encrypted. */
function commKeyField(fd: FormData): { value?: string | null } | { error: string } {
  const raw = str(fd, "commKey");
  if (!raw) return {};
  if (!/^\d{1,9}$/.test(raw)) return { error: "The Comm Key is a number (Menu → Comm. → Connection → Comm Key)." };
  if (raw === "0") return { value: null };
  if (!canStoreSecrets()) return { error: "Set SIP_SECRET_KEY (or CRON_SECRET) on the server first, so the Comm Key can be stored encrypted." };
  return { value: sealSecret(raw) };
}

/** Saves a machine's Comm Key and tries it straight away. */
export async function saveCommKey(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Not allowed." };
  const key = commKeyField(fd);
  if ("error" in key) return key;
  const m = await db.attendanceMachine.update({ where: { id: str(fd, "id") }, data: { commKeyEnc: key.value ?? null } });
  await audit(user.id, "update", "attendanceMachine", m.id, `Comm Key updated for ${m.serial}`);
  const res = await syncPullMachine(m.id);
  revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
  return "error" in res ? { error: res.error } : { ok: true, message: `Connected. ${res.added} new punch(es).` };
}

/** "Fetch now" for one direct-connection machine. */
export async function syncMachineNow(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { error: "Not allowed." };
  const res = await syncPullMachine(str(fd, "id"));
  revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
  return "error" in res ? { error: res.error } : { ok: true, message: `Connected. ${res.added} new punch(es).` };
}


/**
 * Create / edit a machine, ResourceInn style: machine information, connection (IP + port), routing (direct pull or
 * the machine's Cloud Server push) and authentication (Comm Key only when "requires authentication" is ticked).
 * Direct machines are tested straight away.
 */
export async function saveMachine(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only HR with company-wide attendance access can manage machines." };
  const id = str(fd, "id");
  const existing = id ? await db.attendanceMachine.findUnique({ where: { id } }) : null;
  if (id && !existing) return { error: "Machine not found." };
  const name = str(fd, "name").slice(0, 80);
  if (!name) return { error: "Machine name is required." };
  const mode = str(fd, "mode") === "push" ? "push" : "pull";
  const branchId = str(fd, "branchId") || null;
  const location = str(fd, "location").slice(0, 200) || null;
  const timeZone = TIME_ZONES.includes(str(fd, "timeZone")) ? str(fd, "timeZone") : "Asia/Karachi";
  const requiresAuth = fd.get("requiresAuth") === "on";
  const details = { name, branchId, location, timeZone, requiresAuth };

  if (mode === "push") {
    // Cloud Server machines identify themselves by serial number when they call in.
    if (!existing) return { error: "A Cloud Server machine appears here by itself once it calls in (see “Machine sends to AMS” below). Then edit it to fill in these details." };
    await db.attendanceMachine.update({ where: { id: existing.id }, data: details });
    revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
    return { ok: true, message: "Saved." };
  }

  const host = str(fd, "host").replace(/^\w+:\/\//, "").replace(/[/:].*$/, "").slice(0, 120);
  const port = Number(str(fd, "port")) || 4370;
  if (!/^[\w.-]+$/.test(host)) return { error: "Enter the machine's public IP address or domain." };
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost$)/.test(host)) return { error: "That is an office-only (private) address. Use the office's public IP with port forwarding to the machine." };
  if (port < 1 || port > 65535) return { error: "Port must be between 1 and 65535 (usually 4370)." };
  let commKeyEnc: string | null | undefined = undefined;
  if (!requiresAuth) commKeyEnc = null;
  else {
    const key = commKeyField(fd);
    if ("error" in key) return key;
    if (key.value !== undefined) commKeyEnc = key.value;
    else if (!existing?.commKeyEnc) return { error: "Enter the Comm Key, or untick “Machine requires authentication”." };
  }
  const serial = `${host}:${port}`;
  const clash = await db.attendanceMachine.findUnique({ where: { serial } });
  if (clash && clash.id !== existing?.id) return { error: `${serial} is already added (“${clash.name ?? clash.serial}”).` };
  const data = { ...details, serial, host, port, mode: "pull", ...(commKeyEnc !== undefined ? { commKeyEnc } : {}), ...(existing && (existing.host !== host || existing.port !== port) ? { transport: null } : {}) };
  const m = existing
    ? await db.attendanceMachine.update({ where: { id: existing.id }, data })
    : await db.attendanceMachine.create({ data: { ...data, status: "approved" } });
  await audit(user.id, existing ? "update" : "create", "attendanceMachine", m.id, `Machine “${name}” (${serial}) ${existing ? "updated" : "added"}`);
  const res = await syncPullMachine(m.id);
  revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
  return "error" in res ? { error: `Saved, but the test failed: ${res.error}` } : { ok: true, message: `Saved and connected. Read ${res.read} punch(es), ${res.added} new${res.unknown ? `, ${res.unknown} machine ID(s) not linked to employees` : ""}.` };
}

/** Active / Inactive switch (Inactive = not fetched and its pushes are ignored). */
export async function setMachineActive(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const m = await db.attendanceMachine.findUnique({ where: { id: str(fd, "id") } });
  if (!m) return;
  const status = str(fd, "active") === "1" ? "approved" : "blocked";
  await db.attendanceMachine.update({ where: { id: m.id }, data: { status } });
  await audit(user.id, "update", "attendanceMachine", m.id, `Machine ${m.name ?? m.serial} ${status === "approved" ? "activated" : "deactivated"}`);
  revalidatePath("/hr/attendance/machines", "layout"); revalidatePath("/hr/attendance/logs", "layout");
}

// ---------- Employee ↔ machine user mapping (ResourceInn "Change Mapping") ----------

const mapPath = (id: string) => `/hr/attendance/machines/${id}`;

/** Map one machine user to an employee (an employee can be mapped once per machine). */
export async function mapMachineUser(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Not allowed." };
  const machineId = str(fd, "machineId"), muId = str(fd, "machineUserId"), employeeId = str(fd, "employeeId");
  if (!muId || !employeeId) return { error: "Choose an employee and a machine user." };
  const mu = await db.machineUser.findFirst({ where: { id: muId, machineId } });
  if (!mu) return { error: "Machine user not found." };
  await db.machineUser.updateMany({ where: { machineId, employeeId, id: { not: mu.id } }, data: { employeeId: null } });
  await db.machineUser.update({ where: { id: mu.id }, data: { employeeId } });
  const added = await applyMachineLogs(machineId, [mu.deviceUserId]);
  await audit(user.id, "update", "attendanceMachine", machineId, `Mapped machine user ${mu.name ?? ""} (${mu.deviceUserId}) to employee ${employeeId}`);
  revalidatePath(mapPath(machineId));
  return { ok: true, message: `Mapped.${added ? ` ${added} earlier punch(es) added to attendance.` : ""}` };
}

export async function unmapMachineUser(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const mu = await db.machineUser.findUnique({ where: { id: str(fd, "id") } });
  if (!mu) return;
  await db.machineUser.update({ where: { id: mu.id }, data: { employeeId: null } });
  await audit(user.id, "update", "attendanceMachine", mu.machineId, `Removed mapping of machine user ${mu.name ?? ""} (${mu.deviceUserId})`);
  revalidatePath(mapPath(mu.machineId));
}

/** Reads the user list (and new punches) from the machine now. */
export async function syncMachineUsers(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { error: "Not allowed." };
  const id = str(fd, "machineId");
  const res = await syncPullMachine(id);
  revalidatePath(mapPath(id));
  if ("error" in res) return { error: res.error };
  const users = await db.machineUser.count({ where: { machineId: id } });
  return { ok: true, message: `Synced: ${users} machine user(s), ${res.added} new punch(es).` };
}

export async function autoMapUsers(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Not allowed." };
  const id = str(fd, "machineId");
  const before = new Set((await db.machineUser.findMany({ where: { machineId: id, employeeId: { not: null } }, select: { deviceUserId: true } })).map((u) => u.deviceUserId));
  const n = await autoMapMachineUsers(id);
  const now = (await db.machineUser.findMany({ where: { machineId: id, employeeId: { not: null } }, select: { deviceUserId: true } })).map((u) => u.deviceUserId).filter((d) => !before.has(d));
  const added = now.length ? await applyMachineLogs(id, now) : 0;
  if (n) await audit(user.id, "update", "attendanceMachine", id, `Auto-mapped ${n} machine user(s)`);
  revalidatePath(mapPath(id));
  return n ? { ok: true, message: `Auto-mapped ${n} user(s)${added ? `, ${added} punch(es) added to attendance` : ""}. Check the list and fix any wrong match.` } : { error: "No clear matches. Map the rest by hand (names on the machine didn't match one employee each)." };
}

/** CSV upload: employee_code, machine_user_id (the sample file has the machine's users ready to fill in). */
export async function uploadMapping(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Not allowed." };
  const id = str(fd, "machineId");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the CSV file." };
  const lines = (await file.text()).split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))).filter((c) => c.some(Boolean));
  const emps = new Map((await db.employee.findMany({ select: { id: true, code: true } })).map((e) => [e.code.toLowerCase(), e.id]));
  let ok = 0; const bad: string[] = []; const touched: string[] = [];
  for (const [code, devId] of lines) {
    if (!code || !devId || /code/i.test(code)) continue;
    const empId = emps.get(code.toLowerCase());
    if (!empId) { bad.push(code); continue; }
    await db.machineUser.updateMany({ where: { machineId: id, employeeId: empId, deviceUserId: { not: devId } }, data: { employeeId: null } });
    await db.machineUser.upsert({ where: { machineId_deviceUserId: { machineId: id, deviceUserId: devId } }, update: { employeeId: empId }, create: { machineId: id, deviceUserId: devId, employeeId: empId } });
    touched.push(devId); ok++;
  }
  const added = touched.length ? await applyMachineLogs(id, touched) : 0;
  await audit(user.id, "update", "attendanceMachine", id, `Uploaded ${ok} machine user mapping(s)`);
  revalidatePath(mapPath(id));
  return bad.length ? { error: `Mapped ${ok}. Unknown employee codes: ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? "…" : ""}` } : { ok: true, message: `Mapped ${ok} user(s)${added ? `, ${added} punch(es) added` : ""}.` };
}

/** The machine's own log file (USB download, attlog.dat / .txt) for this machine: logs stored, mapped ones counted. */
export async function uploadMachineLogs(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Not allowed." };
  const id = str(fd, "machineId");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the log file from the machine's USB download." };
  const { parseDeviceLog, importDevicePunches } = await import("@/lib/attendance");
  const { rows, skipped } = parseDeviceLog(await file.text());
  if (!rows.length) return { error: "No punches found in that file." };
  const stored = await storeMachineLogs(id, rows);
  const res = await importDevicePunches(rows, user.id, { machineId: id });
  await db.attendanceMachine.update({ where: { id }, data: { punches: { increment: res.added } } });
  revalidatePath(mapPath(id));
  return { ok: true, message: `${rows.length} punch(es) read (${stored} new in logs), ${res.added} added to attendance${res.unknown.length ? `, ${res.unknown.length} user(s) still to map` : ""}${skipped ? `, ${skipped} line(s) skipped` : ""}.` };
}
