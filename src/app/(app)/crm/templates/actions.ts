"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

export async function saveTemplate(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("crm.templates", id ? "edit" : "create");
  const name = str(fd, "name");
  const body = str(fd, "body");
  const channel = str(fd, "channel") === "email" ? "email" : "whatsapp";
  if (!name || !body) return { error: "Name and message are required." };
  const data = { name: name.slice(0, 80), body: body.slice(0, 4000), channel, subject: channel === "email" ? str(fd, "subject").slice(0, 200) || null : null, active: fd.get("active") !== "off" };
  const t = id ? await db.messageTemplate.update({ where: { id }, data }) : await db.messageTemplate.create({ data });
  await audit(user.id, id ? "update" : "create", "template", t.id, `Message template "${t.name}"`);
  revalidatePath("/crm/templates");
  return { ok: true, message: "Template saved." };
}

export async function deleteTemplate(fd: FormData) {
  const user = await requirePermission("crm.templates", "delete");
  const t = await db.messageTemplate.delete({ where: { id: str(fd, "id") } }).catch(() => null);
  if (t) await audit(user.id, "delete", "template", t.id, `Message template "${t.name}"`);
  revalidatePath("/crm/templates");
}
