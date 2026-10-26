"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { attachUnitToDeal, unitWhere } from "@/lib/inventory";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { editableDealFor, logSystem, ownerBranch, parseAmount, phoneKey, resolveOwner } from "@/lib/crm";
import { str, type FormState } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { releaseUnit, syncDealUnits } from "@/lib/inventory";
import type { SessionUser } from "@/lib/auth";

export async function saveDeal(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("crm.deals", id ? "edit" : "create");
  const existing = id ? await editableDealFor(user, id) : null;
  if (id && !existing) return { error: "Deal not found or you can't edit it." };

  const title = str(fd, "title");
  if (title.length < 2) return { error: "Deal title is required." };

  const ownerId = await resolveOwner(user, "crm.deals", str(fd, "ownerId"), existing?.ownerId);
  const branchId = await ownerBranch(ownerId);

  // Contact: pick one the user can see, or create a new one inline.
  let contactId: string | null = str(fd, "contactId") || null;
  if (contactId) {
    const scope = await scopeWhere(user, "crm.contacts");
    if (!scope || !(await db.contact.findFirst({ where: { id: contactId, ...scope }, select: { id: true } }))) contactId = existing?.contactId ?? null;
  }
  const newName = str(fd, "newContactName");
  if (!contactId && newName) {
    const phone = str(fd, "newContactPhone");
    const contact = await db.contact.create({ data: { name: newName, phone: phone || null, phoneKey: phoneKey(phone), ownerId, branchId } });
    contactId = contact.id;
  }

  const close = str(fd, "expectedClose");
  const commission = parseFloat(str(fd, "commissionPct"));
  const data = {
    title, contactId, ownerId, branchId,
    value: parseAmount(str(fd, "value")),
    commissionPct: Number.isFinite(commission) ? commission : null,
    expectedClose: close ? new Date(close) : null,
    sourceId: str(fd, "sourceId") || null,
    notes: str(fd, "notes") || null,
  };

  let dealId = id;
  if (existing) {
    await db.deal.update({ where: { id }, data });
    if (existing.ownerId !== ownerId) {
      const owner = await db.user.findUnique({ where: { id: ownerId } });
      await logSystem({ dealId: id }, `Assigned to ${owner?.name}`, user.id);
      if (ownerId !== user.id) await notify(ownerId, `Deal assigned to you: ${title}`, { body: `By ${user.name}`, link: `/crm/deals/${id}`, email: true });
    }
    await audit(user.id, "update", "deal", id, `Updated deal ${title}`);
  } else {
    const pipeline = await db.pipeline.findUnique({
      where: { id: str(fd, "pipelineId") },
      include: { stages: { where: { kind: "open" }, orderBy: { sortOrder: "asc" }, take: 1 } },
    });
    if (!pipeline?.stages[0]) return { error: "Choose a pipeline." };
    const deal = await db.deal.create({ data: { ...data, pipelineId: pipeline.id, stageId: pipeline.stages[0].id } });
    dealId = deal.id;
    await logSystem({ dealId }, "Deal created", user.id);
    const unitScope = str(fd, "unitId") ? await unitWhere(user, "view") : null;
    const unit = unitScope ? await db.unit.findFirst({ where: { id: str(fd, "unitId"), ...unitScope }, include: { project: true, block: true } }) : null;
    if (unit) {
      const error = await attachUnitToDeal(deal, unit, user.id);
      if (error) await logSystem({ dealId }, `Couldn't link ${unit.unitNo}: ${error}`, user.id);
    }
    if (ownerId !== user.id) await notify(ownerId, `New deal assigned to you: ${title}`, { body: `By ${user.name}`, link: `/crm/deals/${dealId}`, email: true });
    await audit(user.id, "create", "deal", dealId, `Created deal ${title}`);
  }

  revalidatePath("/crm/deals");
  redirect(`/crm/deals/${dealId}`);
}

async function applyStage(user: SessionUser, id: string, stageId: string, reason?: string) {
  const deal = await editableDealFor(user, id);
  if (!deal) return { error: "You can't change this deal." };
  const stage = await db.stage.findUnique({ where: { id: stageId } });
  if (!stage || stage.pipelineId !== deal.pipelineId) return { error: "Unknown stage." };
  if (deal.stageId === stageId) return {};
  if (stage.kind === "lost" && !reason) return { error: "A reason is required to mark a deal lost." };

  await db.deal.update({
    where: { id },
    data: {
      stageId,
      stageChangedAt: new Date(),
      closedAt: stage.kind === "open" ? null : new Date(),
      lostReason: stage.kind === "lost" ? reason : null,
    },
  });
  await syncDealUnits(id);
  await logSystem({ dealId: id }, `Stage: ${deal.stage.name} → ${stage.name}${reason ? ` (${reason})` : ""}`, user.id);
  if (stage.kind !== "open") await audit(user.id, "update", "deal", id, `Deal ${deal.title} marked ${stage.kind}`);
  return {};
}

/** Kanban drop. */
export async function moveDeal(id: string, stageId: string, reason?: string) {
  const user = await requirePermission("crm.deals", "edit");
  const res = await applyStage(user, id, stageId, reason);
  revalidatePath("/crm/deals");
  return res;
}

/** Stage bar / Won / Lost buttons on the deal page. */
export async function setDealStage(fd: FormData) {
  const user = await requirePermission("crm.deals", "edit");
  const id = str(fd, "dealId");
  await applyStage(user, id, str(fd, "stepId"), str(fd, "reason") || undefined);
  revalidatePath(`/crm/deals/${id}`);
  redirect(`/crm/deals/${id}`);
}

export async function deleteDeal(fd: FormData) {
  const user = await requirePermission("crm.deals", "delete");
  const scope = await scopeWhere(user, "crm.deals", "delete");
  const id = str(fd, "id");
  const deal = scope ? await db.deal.findFirst({ where: { id, ...scope }, include: { units: true } }) : null;
  if (deal) {
    for (const du of deal.units) await releaseUnit(du.unitId, id);
    await db.deal.delete({ where: { id } });
    await audit(user.id, "delete", "deal", id, `Deleted deal ${deal.title}`);
  }
  revalidatePath("/crm/deals");
  redirect("/crm/deals");
}
