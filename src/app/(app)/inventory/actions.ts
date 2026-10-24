"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { logSystem, ownerBranch, parseAmount, resolveOwner } from "@/lib/crm";
import { FREQUENCIES, SIZE_UNITS, UNIT_TYPES, releaseUnit, syncDealUnits, unitAllows, unitLabel, unitWhere } from "@/lib/inventory";
import { deleteUpload, saveImage } from "@/lib/files";
import { str, type FormState } from "@/lib/utils";

const num = (fd: FormData, k: string) => {
  const n = parseFloat(str(fd, k).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// ─── Projects & blocks ───────────────────────────────────────

export async function saveProject(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("inventory.projects", id ? "edit" : "create");
  const name = str(fd, "name");
  if (name.length < 2) return { error: "Project name is required." };
  const clash = await db.project.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: "A project with this name already exists." };

  const freq = str(fd, "planFrequency");
  const data = {
    name, code: str(fd, "code") || null, developer: str(fd, "developer") || null, location: str(fd, "location") || null,
    city: str(fd, "city") || "Karachi", kind: str(fd, "kind") || "residential", status: str(fd, "status") || "active",
    description: str(fd, "description") || null,
    planDownPct: num(fd, "planDownPct"), planInstallments: num(fd, "planInstallments"),
    planFrequency: FREQUENCIES.some((f) => f.value === freq) ? freq : null, planPossessionPct: num(fd, "planPossessionPct"),
  };
  const project = id
    ? await db.project.update({ where: { id }, data: { ...data, planInstallments: data.planInstallments && Math.round(data.planInstallments) } })
    : await db.project.create({ data: { ...data, planInstallments: data.planInstallments && Math.round(data.planInstallments) } });
  await audit(user.id, id ? "update" : "create", "project", project.id, `${id ? "Updated" : "Created"} project ${name}`);
  revalidatePath("/inventory");
  redirect(`/inventory/projects/${project.id}`);
}

export async function saveBlock(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("inventory.projects", "edit");
  const id = str(fd, "id");
  const projectId = str(fd, "projectId");
  const name = str(fd, "name");
  if (!name) return { error: "Block name is required." };
  const clash = await db.block.findFirst({ where: { projectId, name, NOT: id ? { id } : undefined } });
  if (clash) return { error: "This project already has a block with that name." };
  const sortOrder = num(fd, "sortOrder") ?? 0;
  if (id) await db.block.update({ where: { id }, data: { name, sortOrder } });
  else await db.block.create({ data: { projectId, name, sortOrder } });
  await audit(user.id, id ? "update" : "create", "block", id || null, `${id ? "Updated" : "Added"} block ${name}`);
  revalidatePath(`/inventory/projects/${projectId}`);
  return { ok: true };
}

/** Creates a numbered run of units, e.g. prefix "A-" 101…120. Skips numbers that already exist in the block. */
export async function bulkCreateUnits(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("inventory.projects", "create");
  const projectId = str(fd, "projectId");
  const block = await db.block.findFirst({ where: { id: str(fd, "blockId"), projectId } });
  if (!block) return { error: "Choose a block." };
  const from = Math.round(num(fd, "from") ?? NaN);
  const to = Math.round(num(fd, "to") ?? NaN);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return { error: "Enter a valid number range." };
  if (to - from > 499) return { error: "Up to 500 units at a time." };
  const type = str(fd, "type");
  if (!UNIT_TYPES.includes(type as (typeof UNIT_TYPES)[number])) return { error: "Choose a unit type." };

  const prefix = str(fd, "prefix");
  const existing = new Set((await db.unit.findMany({ where: { blockId: block.id }, select: { unitNo: true } })).map((u) => u.unitNo));
  const sizeUnit = SIZE_UNITS.some((s) => s.value === str(fd, "sizeUnit")) ? str(fd, "sizeUnit") : "sqft";
  const rows = [];
  for (let n = from; n <= to; n++) {
    const unitNo = `${prefix}${n}`;
    if (existing.has(unitNo)) continue;
    rows.push({
      projectId, blockId: block.id, unitNo, type, listingType: "project", purpose: "sale",
      size: num(fd, "size"), sizeUnit, bedrooms: num(fd, "bedrooms"), price: parseAmount(str(fd, "price")), floor: str(fd, "floor") || null,
    });
  }
  if (rows.length) await db.unit.createMany({ data: rows.map((r) => ({ ...r, bedrooms: r.bedrooms && Math.round(r.bedrooms) })) });
  await audit(user.id, "create", "unit", null, `Added ${rows.length} unit(s) to ${block.name}`);
  revalidatePath(`/inventory/projects/${projectId}`);
  return { ok: true, message: `Added ${rows.length} unit(s)${to - from + 1 > rows.length ? `, skipped ${to - from + 1 - rows.length} existing` : ""}.` };
}

// ─── Units ───────────────────────────────────────────────────

export async function saveUnit(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const existing = id ? await db.unit.findUnique({ where: { id } }) : null;
  if (id && (!existing || !(await unitAllows(user, existing, "edit")))) return { error: "Unit not found or you can't edit it." };

  const listingType = existing?.listingType ?? str(fd, "listingType");
  if (!["project", "resale", "rental"].includes(listingType)) return { error: "Choose a listing type." };
  if (!id && !(await unitAllows(user, { listingType, ownerId: user.id, branchId: user.branchId }, "create"))) {
    return { error: listingType === "project" ? "Your role can't add project stock." : "Your role can't add listings." };
  }

  const unitNo = str(fd, "unitNo");
  const type = str(fd, "type");
  if (!unitNo) return { error: "Unit / plot number is required." };
  if (!UNIT_TYPES.includes(type as (typeof UNIT_TYPES)[number])) return { error: "Choose a property type." };

  let projectId: string | null = str(fd, "projectId") || null;
  let blockId: string | null = str(fd, "blockId") || null;
  if (blockId) {
    const block = await db.block.findUnique({ where: { id: blockId } });
    if (!block) blockId = null;
    else projectId = block.projectId;
  }
  if (listingType === "project" && !projectId) return { error: "Project stock must belong to a project." };

  const isListing = listingType !== "project";
  const ownerId = isListing ? await resolveOwner(user, "inventory.units", str(fd, "ownerId"), existing?.ownerId) : null;
  const sizeUnit = SIZE_UNITS.some((s) => s.value === str(fd, "sizeUnit")) ? str(fd, "sizeUnit") : "sqft";
  const beds = num(fd, "bedrooms");
  const baths = num(fd, "bathrooms");
  const data = {
    listingType, purpose: listingType === "rental" ? "rent" : str(fd, "purpose") === "rent" ? "rent" : "sale",
    projectId, blockId, unitNo, type, size: num(fd, "size"), sizeUnit,
    bedrooms: beds && Math.round(beds), bathrooms: baths && Math.round(baths),
    floor: str(fd, "floor") || null, facing: str(fd, "facing") || null,
    corner: fd.get("corner") === "on", parkFacing: fd.get("parkFacing") === "on", mainRoad: fd.get("mainRoad") === "on",
    price: parseAmount(str(fd, "price")), address: str(fd, "address") || null,
    lat: num(fd, "lat"), lng: num(fd, "lng"),
    propertyOwner: isListing ? str(fd, "propertyOwner") || null : null,
    propertyOwnerPhone: isListing ? str(fd, "propertyOwnerPhone") || null : null,
    notes: str(fd, "notes") || null, ownerId, branchId: isListing ? await ownerBranch(ownerId) : null,
  };

  const unit = existing ? await db.unit.update({ where: { id }, data }) : await db.unit.create({ data });
  await audit(user.id, existing ? "update" : "create", "unit", unit.id, `${existing ? "Updated" : "Added"} unit ${unitNo}`);
  revalidatePath("/inventory");
  redirect(`/inventory/units/${unit.id}`);
}

/** Manual status: only available / hold / off-market, and only when no deal holds the unit. */
export async function setUnitStatus(fd: FormData) {
  const user = await requireUser();
  const unit = await db.unit.findUnique({ where: { id: str(fd, "id") } });
  const status = str(fd, "status");
  if (!unit || !(await unitAllows(user, unit, "edit"))) return;
  if (unit.activeDealId || !["available", "hold", "offmarket"].includes(status)) return;
  await db.unit.update({ where: { id: unit.id }, data: { status } });
  await audit(user.id, "update", "unit", unit.id, `Unit ${unit.unitNo} set to ${status}`);
  revalidatePath(`/inventory/units/${unit.id}`);
}

export async function deleteUnit(fd: FormData) {
  const user = await requireUser();
  const unit = await db.unit.findUnique({ where: { id: str(fd, "id") }, include: { images: true, _count: { select: { deals: true } } } });
  if (!unit || !(await unitAllows(user, unit, "delete")) || unit._count.deals > 0) return;
  for (const img of unit.images) await deleteUpload(img.path);
  await db.unit.delete({ where: { id: unit.id } });
  await audit(user.id, "delete", "unit", unit.id, `Deleted unit ${unit.unitNo}`);
  redirect(unit.projectId ? `/inventory/projects/${unit.projectId}` : "/inventory");
}

export async function uploadUnitImages(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const unit = await db.unit.findUnique({ where: { id: str(fd, "unitId") }, include: { _count: { select: { images: true } } } });
  if (!unit || !(await unitAllows(user, unit, "edit"))) return { error: "You can't edit this unit." };
  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose at least one image." };
  if (unit._count.images + files.length > 12) return { error: "A unit can have up to 12 photos." };

  let order = unit._count.images;
  for (const file of files) {
    const res = await saveImage(file, `units/${unit.id}`);
    if ("error" in res) return { error: res.error };
    await db.unitImage.create({ data: { unitId: unit.id, path: res.path, sortOrder: order++ } });
  }
  revalidatePath(`/inventory/units/${unit.id}`);
  return { ok: true, message: `Uploaded ${files.length} photo(s).` };
}

export async function deleteUnitImage(fd: FormData) {
  const user = await requireUser();
  const img = await db.unitImage.findUnique({ where: { id: str(fd, "id") }, include: { unit: true } });
  if (!img || !(await unitAllows(user, img.unit, "edit"))) return;
  await deleteUpload(img.path);
  await db.unitImage.delete({ where: { id: img.id } });
  revalidatePath(`/inventory/units/${img.unitId}`);
}

// ─── Deal ↔ unit ─────────────────────────────────────────────

export async function linkUnitToDeal(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.deals", "edit");
  const dealScope = await scopeWhere(user, "crm.deals", "edit");
  const deal = dealScope ? await db.deal.findFirst({ where: { id: str(fd, "dealId"), ...dealScope } }) : null;
  if (!deal) return { error: "You can't edit this deal." };

  const visible = await unitWhere(user, "view");
  const unit = visible ? await db.unit.findFirst({ where: { id: str(fd, "unitId"), ...visible }, include: { project: true, block: true } }) : null;
  if (!unit) return { error: "Choose a unit." };
  if (unit.activeDealId && unit.activeDealId !== deal.id) return { error: `${unit.unitNo} is already ${unit.status} through another deal.` };
  if (!["available", "hold"].includes(unit.status) && unit.activeDealId !== deal.id) return { error: `${unit.unitNo} is ${unit.status} and can't be linked.` };

  await db.dealUnit.upsert({ where: { dealId_unitId: { dealId: deal.id, unitId: unit.id } }, update: {}, create: { dealId: deal.id, unitId: unit.id } });
  if (deal.value == null && unit.price) await db.deal.update({ where: { id: deal.id }, data: { value: unit.price } });
  await syncDealUnits(deal.id);
  await logSystem({ dealId: deal.id }, `Linked unit ${unitLabel(unit)}`, user.id);
  revalidatePath(`/crm/deals/${deal.id}`);
  return { ok: true };
}

export async function unlinkUnitFromDeal(fd: FormData) {
  const user = await requirePermission("crm.deals", "edit");
  const dealScope = await scopeWhere(user, "crm.deals", "edit");
  const deal = dealScope ? await db.deal.findFirst({ where: { id: str(fd, "dealId"), ...dealScope } }) : null;
  if (!deal) return;
  const unitId = str(fd, "unitId");
  const link = await db.dealUnit.findUnique({ where: { dealId_unitId: { dealId: deal.id, unitId } }, include: { unit: true } });
  if (!link) return;
  await db.dealUnit.delete({ where: { dealId_unitId: { dealId: deal.id, unitId } } });
  await releaseUnit(unitId, deal.id);
  await logSystem({ dealId: deal.id }, `Unlinked unit ${link.unit.unitNo}`, user.id);
  revalidatePath(`/crm/deals/${deal.id}`);
}
