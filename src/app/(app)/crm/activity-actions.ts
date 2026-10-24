"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { ACTIVITY_TYPES, canAccessEntity, ownerBranch, resolveOwner, type EntityRef } from "@/lib/crm";
import { str, type FormState } from "@/lib/utils";

const SCHEDULABLE = ["task", "meeting", "visit"];

function refFrom(fd: FormData): EntityRef {
  const ref: EntityRef = {};
  for (const k of ["leadId", "dealId", "contactId", "companyId"] as const) {
    const v = str(fd, k);
    if (v) ref[k] = v;
  }
  return ref;
}

export async function addActivity(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.activities", "create");
  const ref = refFrom(fd);
  const type = str(fd, "type");
  const label = ACTIVITY_TYPES.find((t) => t.value === type)?.label;
  if (!label) return { error: "Choose an activity type." };

  const personal = Object.keys(ref).length === 0; // e.g. a task added from the Tasks page
  if (personal ? !SCHEDULABLE.includes(type) : !(await canAccessEntity(user, ref))) {
    return { error: "You can't add activity to this record." };
  }

  const body = str(fd, "body");
  const subject = str(fd, "subject") || (type === "note" ? body.slice(0, 80) : label);
  if (!subject) return { error: "Write something first." };

  const dueRaw = str(fd, "dueAt");
  const dueAt = SCHEDULABLE.includes(type) && dueRaw ? new Date(dueRaw) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return { error: "Invalid date." };
  if (type === "task" && !dueAt) return { error: "Tasks need a due date." };

  const ownerId = await resolveOwner(user, "crm.activities", str(fd, "ownerId"));
  await db.activity.create({
    data: {
      type, subject, body: body || null, dueAt,
      doneAt: dueAt ? null : new Date(), // scheduled items stay open; logged items are done
      ...ref, ownerId, createdById: user.id, branchId: await ownerBranch(ownerId),
    },
  });
  if (ref.leadId) await db.lead.update({ where: { id: ref.leadId }, data: { lastActivityAt: new Date() } });

  revalidatePath(str(fd, "path") || "/crm/tasks");
  return { ok: true };
}

async function editableActivity(id: string) {
  const user = await requirePermission("crm.activities", "edit");
  const scope = await scopeWhere(user, "crm.activities", "edit");
  return scope ? db.activity.findFirst({ where: { id, type: { not: "system" }, ...scope } }) : null;
}

export async function toggleActivity(fd: FormData) {
  const act = await editableActivity(str(fd, "id"));
  if (!act) return;
  await db.activity.update({ where: { id: act.id }, data: { doneAt: act.doneAt ? null : new Date() } });
  revalidatePath(str(fd, "path") || "/crm/tasks");
}

export async function deleteActivity(fd: FormData) {
  const user = await requirePermission("crm.activities", "delete");
  const scope = await scopeWhere(user, "crm.activities", "delete");
  if (!scope) return;
  await db.activity.deleteMany({ where: { id: str(fd, "id"), type: { not: "system" }, ...scope } });
  revalidatePath(str(fd, "path") || "/crm/tasks");
}
