"use server";

import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { sendMail, smtpConfigured } from "@/lib/mail";
import { APP_URL } from "@/lib/notify";
import { TEMPLATE_DEFS } from "@/lib/notify-templates";
import { DASHBOARD_WIDGETS } from "@/lib/hr-dashboard-widgets";
import { str, type FormState } from "@/lib/utils";

const admin = async () => {
  const user = await requireUser();
  return user.isSuperAdmin || can(user, "settings.company", "edit") ? user : null;
};

// ─── Custom fields ──────────────────────────────────────────

export async function saveCustomField(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only admins can change custom fields." };
  const label = str(fd, "label").slice(0, 60);
  const kind = ["text", "number", "date", "select"].includes(str(fd, "kind")) ? str(fd, "kind") : "text";
  const options = str(fd, "options").split(",").map((s) => s.trim()).filter(Boolean).join(",");
  if (!label) return { error: "Give the field a label." };
  if (kind === "select" && !options) return { error: "List the choices, separated by commas." };
  await db.customField.create({ data: { label, kind, options: kind === "select" ? options : null, required: fd.get("required") === "on", sortOrder: await db.customField.count() } });
  await audit(user.id, "create", "customField", label, `Custom field ${label}`);
  revalidatePath("/hr/settings/custom-fields");
  return { ok: true, message: "Field added. It now shows on every employee profile." };
}

export async function updateCustomField(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const id = str(fd, "id");
  if (str(fd, "op") === "delete") await db.customField.delete({ where: { id } });
  else {
    const f = await db.customField.findUnique({ where: { id } });
    if (f) await db.customField.update({ where: { id }, data: { active: !f.active } });
  }
  revalidatePath("/hr/settings/custom-fields");
}

// ─── Dashboard widgets ──────────────────────────────────────

export async function saveDashboardWidgets(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only admins can change the dashboard." };
  const shown = new Set(fd.getAll("show").map(String));
  const hidden = DASHBOARD_WIDGETS.filter((w) => !shown.has(w.key)).map((w) => w.key).join(",");
  await db.setting.upsert({ where: { key: "hr.dashboard.hidden" }, update: { value: hidden }, create: { key: "hr.dashboard.hidden", value: hidden } });
  revalidatePath("/hr");
  return { ok: true, message: "Saved. The HR dashboard shows the ticked widgets." };
}

// ─── Notification templates ─────────────────────────────────

export async function saveTemplates(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only admins can change templates." };
  for (const t of TEMPLATE_DEFS) {
    const title = str(fd, `${t.key}:title`).slice(0, 200);
    const body = str(fd, `${t.key}:body`).slice(0, 2000);
    const key = `tpl.${t.key}`;
    if (!title || (title === t.title && body === t.body)) await db.setting.deleteMany({ where: { key } });
    else await db.setting.upsert({ where: { key }, update: { value: JSON.stringify({ title, body }) }, create: { key, value: JSON.stringify({ title, body }) } });
  }
  await audit(user.id, "update", "setting", "tpl", "Notification templates updated");
  revalidatePath("/hr/settings/notification-templates");
  return { ok: true, message: "Templates saved." };
}

// ─── Email verification ─────────────────────────────────────

async function sendVerification(u: { id: string; email: string; name: string }) {
  const token = randomBytes(24).toString("base64url");
  await db.emailToken.create({ data: { userId: u.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
  await sendMail(u.email, "Please verify your email address", `Hi ${u.name},\n\nPlease confirm this is your email address for The Advisor Associates system:\n\n${APP_URL()}/verify-email?token=${token}\n\nThe link works for 7 days.`, { userId: u.id });
}

export async function sendVerifications(_: FormState, fd: FormData): Promise<FormState> {
  const user: SessionUser | null = await admin();
  if (!user) return { error: "Only admins can send verification emails." };
  if (!smtpConfigured()) return { error: "Email isn't set up yet (Settings → Integrations → Email)." };
  const id = str(fd, "userId");
  const users = await db.user.findMany({ where: { active: true, emailVerifiedAt: null, ...(id ? { id } : {}), NOT: { email: { endsWith: ".local" } } }, select: { id: true, email: true, name: true } });
  for (const u of users) await sendVerification(u);
  await audit(user.id, "update", "user", id || null, `Sent ${users.length} verification email(s)`);
  revalidatePath("/hr/settings/email-verification");
  return { ok: true, message: users.length ? `Sent to ${users.length} user${users.length === 1 ? "" : "s"}.` : "Everyone is verified (sample .local addresses are skipped)." };
}

export async function markVerified(fd: FormData) {
  const user = await admin();
  if (!user) return;
  await db.user.update({ where: { id: str(fd, "userId") }, data: { emailVerifiedAt: new Date() } });
  revalidatePath("/hr/settings/email-verification");
}
