// Creating an activity (call, note, task…), shared by the timeline composer (crm/activity-actions.ts)
// and the in-place lead list (crm/leads/list-actions.ts). The caller checks crm.activities create.
import { db } from "./db";
import { ACTIVITY_TYPES, canAccessEntity, ownerBranch, resolveOwner, type EntityRef } from "./crm";
import { notify } from "./notify";
import { str, type FormState } from "./utils";
import type { SessionUser } from "./auth";

const SCHEDULABLE = ["task", "meeting", "visit"];

function refFrom(fd: FormData): EntityRef {
  const ref: EntityRef = {};
  for (const k of ["leadId", "dealId", "contactId", "companyId"] as const) {
    const v = str(fd, k);
    if (v) ref[k] = v;
  }
  return ref;
}

export async function createActivity(user: SessionUser, fd: FormData): Promise<FormState> {
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
  if (ownerId !== user.id) {
    const link = ref.leadId ? `/crm/leads/${ref.leadId}` : ref.dealId ? `/crm/deals/${ref.dealId}` : ref.contactId ? `/crm/contacts/${ref.contactId}` : "/crm/tasks";
    await notify(ownerId, `${label} for you: ${subject}`, { body: `From ${user.name}${dueAt ? ` · due ${dueAt.toLocaleString("en-PK")}` : ""}`, link, email: true });
  }
  return { ok: true };
}
