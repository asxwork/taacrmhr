"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { ACTIVITY_TYPES, canAccessEntity, ownerBranch, resolveOwner, type EntityRef } from "@/lib/crm";
import { str, type FormState } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";

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
  if (ownerId !== user.id) {
    const link = ref.leadId ? `/crm/leads/${ref.leadId}` : ref.dealId ? `/crm/deals/${ref.dealId}` : ref.contactId ? `/crm/contacts/${ref.contactId}` : "/crm/tasks";
    await notify(ownerId, `${label} for you: ${subject}`, { body: `From ${user.name}${dueAt ? ` · due ${dueAt.toLocaleString("en-PK")}` : ""}`, link, email: true });
  }

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

/** Activities are the record of what agents did, so only a Super Admin can delete one. */
export async function deleteActivity(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const act = await db.activity.findFirst({ where: { id: str(fd, "id"), type: { not: "system" } } });
  if (!act) return;
  await db.activity.delete({ where: { id: act.id } });
  await audit(user.id, "delete", "activity", act.id, `Deleted activity “${act.subject}”`);
  revalidatePath(str(fd, "path") || "/crm/tasks");
}

/** Email the client on a lead/deal/contact. Always goes to the record's own address; logged on the timeline. */
export async function sendEntityEmail(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.activities", "create");
  const ref = refFrom(fd);
  if (!Object.keys(ref).length || !(await canAccessEntity(user, ref))) return { error: "You can't email from this record." };

  const to = await recordEmail(ref);
  if (!to) return { error: "This record has no email address." };
  const subject = str(fd, "subject");
  const body = str(fd, "body");
  if (!subject || !body) return { error: "Write a subject and a message." };

  const me = await db.user.findUnique({ where: { id: user.id }, select: { email: true } });
  const replyTo = me && !me.email.endsWith(".local") ? me.email : undefined;
  const res = await sendMail(to, subject, body, { userId: user.id, leadId: ref.leadId, dealId: ref.dealId, contactId: ref.contactId }, replyTo);

  await db.activity.create({
    data: {
      type: "email", subject: `${res.status === "sent" ? "Email sent" : "Email NOT sent"}: ${subject}`,
      body: res.status === "sent" ? `To ${to}\n\n${body}` : `To ${to} — ${res.error}\n\n${body}`,
      doneAt: new Date(), ...ref, ownerId: user.id, createdById: user.id, branchId: user.branchId,
    },
  });
  revalidatePath(str(fd, "path") || "/crm/leads");
  return res.status === "sent" ? { ok: true, message: `Sent to ${to}.` } : { error: `Not sent: ${res.error}. Saved on the timeline.` };
}

async function recordEmail(ref: EntityRef) {
  if (ref.leadId) return (await db.lead.findUnique({ where: { id: ref.leadId }, select: { email: true } }))?.email ?? null;
  if (ref.contactId) return (await db.contact.findUnique({ where: { id: ref.contactId }, select: { email: true } }))?.email ?? null;
  if (ref.companyId) return (await db.company.findUnique({ where: { id: ref.companyId }, select: { email: true } }))?.email ?? null;
  if (ref.dealId) return (await db.deal.findUnique({ where: { id: ref.dealId }, select: { contact: { select: { email: true } } } }))?.contact?.email ?? null;
  return null;
}
