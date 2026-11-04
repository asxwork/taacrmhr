"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeMatcher } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

const FILL = ["email", "phone2", "sourceId", "campaign", "sourceInfo", "projectId", "unitId", "interest", "propertyType", "location", "budgetMin", "budgetMax", "contactId", "ownerId", "branchId"] as const;

/** Merges duplicate leads into the one kept: history, deals and matches move over, blanks are filled, the rest are deleted. */
export async function mergeLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.merge", "edit");
  const keepId = str(fd, "keep");
  const ids = [...new Set(fd.getAll("ids").map(String))];
  if (!keepId || ids.length < 2 || !ids.includes(keepId)) return { error: "Pick the lead to keep." };
  const leads = await db.lead.findMany({ where: { id: { in: ids } } });
  if (leads.length !== ids.length) return { error: "Some of these leads no longer exist — refresh the page." };
  const allowed = await scopeMatcher(user, "crm.merge", "edit");
  if (!leads.every(allowed)) return { error: "You can only merge leads you're allowed to edit." };
  const keep = leads.find((l) => l.id === keepId)!;
  const others = leads.filter((l) => l.id !== keepId).sort((a, b) => +a.createdAt - +b.createdAt);
  const otherIds = others.map((o) => o.id);

  const fill: Record<string, unknown> = {};
  for (const k of FILL) if (keep[k] == null) { const v = others.find((o) => o[k] != null)?.[k]; if (v != null) fill[k] = v; }
  const notes = [keep.notes, ...others.map((o) => o.notes && `From lead #${o.number ?? o.id.slice(-5)}: ${o.notes}`)].filter(Boolean).join("\n\n") || null;
  const lastActivityAt = [keep, ...others].map((l) => l.lastActivityAt).filter(Boolean).sort((a, b) => +b! - +a!)[0] ?? null;

  const taken = new Set((await db.propertyMatch.findMany({ where: { leadId: keepId }, select: { unitId: true } })).map((m) => m.unitId));
  await db.$transaction([
    db.activity.updateMany({ where: { leadId: { in: otherIds } }, data: { leadId: keepId } }),
    db.deal.updateMany({ where: { leadId: { in: otherIds } }, data: { leadId: keepId } }),
    db.propertyMatch.deleteMany({ where: { leadId: { in: otherIds }, unitId: { in: [...taken] } } }),
    db.propertyMatch.updateMany({ where: { leadId: { in: otherIds } }, data: { leadId: keepId } }),
    db.lead.update({ where: { id: keepId }, data: { ...fill, notes, lastActivityAt, ...(others.some((o) => o.convertedAt) && !keep.convertedAt ? { convertedAt: others.find((o) => o.convertedAt)!.convertedAt } : {}) } }),
    db.activity.create({ data: { type: "note", subject: `Merged ${others.length} duplicate lead(s) into this one`, body: others.map((o) => `#${o.number ?? "—"} ${o.name} (created ${o.createdAt.toISOString().slice(0, 10)})`).join("\n"), leadId: keepId, ownerId: user.id, createdById: user.id, doneAt: new Date(), branchId: keep.branchId } }),
    db.lead.deleteMany({ where: { id: { in: otherIds } } }),
  ]);
  await audit(user.id, "update", "lead", keepId, `Merged ${others.map((o) => `#${o.number ?? o.id}`).join(", ")} into #${keep.number ?? keepId}`);
  revalidatePath("/crm/duplicates");
  revalidatePath(`/crm/leads/${keepId}`);
  return { ok: true, message: `Merged into ${keep.name}.` };
}
