"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import type { AutomationConfig } from "@/lib/automations";

/** Automations can delete activities and move many leads at once, so only Super Admins manage them. */
async function admin() {
  const user = await requireUser();
  return user.isSuperAdmin ? user : null;
}

export async function saveAutomation(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only a Super Admin can change automations." };
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (name.length < 2) return { error: "Give the automation a name." };
  const assign = ["keep", "one", "roundrobin"].includes(str(fd, "assign")) ? (str(fd, "assign") as AutomationConfig["assign"]) : "keep";
  const config: AutomationConfig = {
    assign, userIds: fd.getAll("userIds").map(String), avoidSameAgent: fd.get("avoidSameAgent") === "on",
    stageId: str(fd, "stageId") || null, deleteOpen: fd.get("deleteOpen") === "on", deleteHistory: fd.get("deleteHistory") === "on",
    markReshuffled: fd.get("markReshuffled") === "on", planCall: fd.get("planCall") === "on",
  };
  const data = { name, config: JSON.stringify(config), active: fd.get("active") !== "off" };
  const a = id ? await db.automation.update({ where: { id }, data }) : await db.automation.create({ data });
  await audit(user.id, id ? "update" : "create", "automation", a.id, `${id ? "Updated" : "Created"} automation ${name}`);
  revalidatePath("/crm/automations");
  redirect("/crm/automations");
}

export async function deleteAutomation(fd: FormData) {
  const user = await admin();
  if (!user) return;
  const a = await db.automation.findUnique({ where: { id: str(fd, "id") } });
  if (!a) return;
  await db.automation.delete({ where: { id: a.id } });
  await audit(user.id, "delete", "automation", a.id, `Deleted automation ${a.name}`);
  revalidatePath("/crm/automations");
  redirect("/crm/automations");
}
