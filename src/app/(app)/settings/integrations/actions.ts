"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { INTAKE_KEYS, hashKey, newSecret, setSetting } from "@/lib/lead-intake";
import { sendMail, smtpConfigured } from "@/lib/mail";
import { str, type FormState } from "@/lib/utils";

export async function regenerateSecret(fd: FormData) {
  const user = await requirePermission("settings.company", "edit");
  const which = fd.get("which") === "facebook" ? INTAKE_KEYS.facebookVerify : INTAKE_KEYS.webformKey;
  await setSetting(which, newSecret());
  await audit(user.id, "update", "setting", which, `Regenerated ${which === INTAKE_KEYS.webformKey ? "website form key" : "Facebook verify token"}`);
  revalidatePath("/settings/integrations");
}

export async function saveAssignees(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const ids = fd.getAll("assignees").map(String);
  const valid = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  await setSetting(INTAKE_KEYS.assignees, valid.map((v) => v.id).join(","));
  await audit(user.id, "update", "setting", INTAKE_KEYS.assignees, `Lead round-robin set to ${valid.length} people`);
  revalidatePath("/settings/integrations");
  return { ok: true, message: valid.length ? `New leads rotate across ${valid.length} people.` : "No one selected — new leads go to the Super Admin." };
}

export async function sendTestEmail(): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  if (!smtpConfigured()) return { error: "SMTP isn't configured yet. Add the SMTP_* settings to the server environment first." };
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
  if (me.email.endsWith(".local")) return { error: "Your account email is a demo address. Change it in Users first." };
  const res = await sendMail(me.email, "Test email from The Advisor Associates CRM", "If you can read this, outgoing email is working.", { userId: user.id });
  return res.status === "sent" ? { ok: true, message: `Test email sent to ${me.email}.` } : { error: `Failed: ${res.error}` };
}

// ─── API connections (POST /api/v1/leads) ──────────────────────────────────

const newKey = () => `taa_${newSecret()}`;
const keyShown = (key: string) => `Copy this key now, it won't be shown again: ${key}`;

async function connectionFields(fd: FormData) {
  const ids = fd.getAll("assignees").map(String);
  const valid = ids.length ? await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } }) : [];
  const sourceId = str(fd, "sourceId");
  const source = sourceId ? await db.leadSource.findUnique({ where: { id: sourceId }, select: { id: true } }) : null;
  return { sourceId: source?.id ?? null, assigneeIds: valid.map((v) => v.id).join(",") || null };
}

export async function createConnection(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const name = str(fd, "name");
  if (name.length < 2) return { error: "Give the connection a name, e.g. Zameen or Website." };
  const key = newKey();
  const conn = await db.apiConnection.create({ data: { name, keyHash: hashKey(key), keyHint: key.slice(-4), ...(await connectionFields(fd)) } });
  await audit(user.id, "create", "apiConnection", conn.id, `Created API connection ${name}`);
  revalidatePath("/settings/integrations");
  return { ok: true, message: keyShown(key) };
}

export async function updateConnection(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings.company", "edit");
  const id = str(fd, "id");
  const op = str(fd, "op");
  const conn = await db.apiConnection.findUnique({ where: { id } });
  if (!conn) return { error: "Connection not found." };
  if (op === "delete") {
    await db.apiConnection.delete({ where: { id } });
    await audit(user.id, "delete", "apiConnection", id, `Deleted API connection ${conn.name}`);
    revalidatePath("/settings/integrations");
    return { ok: true, message: "Deleted. Its key no longer works." };
  }
  if (op === "rotate") {
    const key = newKey();
    await db.apiConnection.update({ where: { id }, data: { keyHash: hashKey(key), keyHint: key.slice(-4) } });
    await audit(user.id, "update", "apiConnection", id, `Rotated key for ${conn.name}`);
    revalidatePath("/settings/integrations");
    return { ok: true, message: keyShown(key) };
  }
  if (op === "toggle") {
    await db.apiConnection.update({ where: { id }, data: { active: !conn.active } });
    await audit(user.id, "update", "apiConnection", id, `${conn.active ? "Disabled" : "Enabled"} API connection ${conn.name}`);
    revalidatePath("/settings/integrations");
    return { ok: true, message: conn.active ? "Disabled. Leads sent with its key are refused." : "Enabled." };
  }
  const name = str(fd, "name") || conn.name;
  await db.apiConnection.update({ where: { id }, data: { name, ...(await connectionFields(fd)) } });
  await audit(user.id, "update", "apiConnection", id, `Updated API connection ${name}`);
  revalidatePath("/settings/integrations");
  return { ok: true, message: "Saved." };
}
