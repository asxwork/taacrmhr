"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { syncPullMachine } from "@/lib/attendance-machine";
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
  revalidatePath("/hr/attendance/machines");
}

/** Super Admin: forget a machine (it reappears as pending if it calls in again). */
export async function deleteMachine(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const m = await db.attendanceMachine.findUnique({ where: { id: str(fd, "id") } });
  if (!m) return;
  await db.attendanceMachine.delete({ where: { id: m.id } });
  await audit(user.id, "delete", "attendanceMachine", m.id, `Machine ${m.serial} removed`);
  revalidatePath("/hr/attendance/machines");
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
  revalidatePath("/hr/attendance/machines");
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
  revalidatePath("/hr/attendance/machines");
  return "error" in res ? { error: res.error } : { ok: true, message: `Connected. ${res.added} new punch(es).` };
}

/** "Fetch now" for one direct-connection machine. */
export async function syncMachineNow(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { error: "Not allowed." };
  const res = await syncPullMachine(str(fd, "id"));
  revalidatePath("/hr/attendance/machines");
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
    revalidatePath("/hr/attendance/machines");
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
  revalidatePath("/hr/attendance/machines");
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
  revalidatePath("/hr/attendance/machines");
}
