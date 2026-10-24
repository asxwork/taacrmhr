"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { INTAKE_KEYS, newSecret, setSetting } from "@/lib/lead-intake";
import { sendMail, smtpConfigured } from "@/lib/mail";
import type { FormState } from "@/lib/utils";

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
