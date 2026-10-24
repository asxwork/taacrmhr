"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { ASSET_CATEGORIES } from "@/lib/hr-shared";
import { str, type FormState } from "@/lib/utils";

const refresh = (employeeId?: string | null) => {
  revalidatePath("/hr/assets");
  if (employeeId) revalidatePath(`/hr/employees/${employeeId}`);
};

export async function saveAsset(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("hr.assets", id ? "edit" : "create");
  const tag = str(fd, "tag").toUpperCase();
  const name = str(fd, "name");
  if (!tag || name.length < 2) return { error: "Asset tag and name are required." };
  if (await db.asset.findFirst({ where: { tag, NOT: id ? { id } : undefined } })) return { error: `Tag ${tag} is already used.` };
  const cost = parseFloat(str(fd, "cost").replace(/,/g, ""));
  const purchasedAt = str(fd, "purchasedAt") ? new Date(str(fd, "purchasedAt")) : null;
  const data = {
    tag, name, category: ASSET_CATEGORIES.includes(str(fd, "category")) ? str(fd, "category") : "Other",
    serial: str(fd, "serial") || null, cost: Number.isFinite(cost) ? cost : null,
    purchasedAt: purchasedAt && !Number.isNaN(purchasedAt.getTime()) ? purchasedAt : null, notes: str(fd, "notes") || null,
  };
  const asset = id ? await db.asset.update({ where: { id }, data }) : await db.asset.create({ data: { ...data, logs: { create: { action: "added", byId: user.id } } } });
  await audit(user.id, id ? "update" : "create", "asset", asset.id, `${id ? "Updated" : "Added"} asset ${tag} ${name}`);
  refresh(asset.assignedToId);
  redirect(`/hr/assets?a=${asset.id}`);
}

/** assign | return | repair | retire | available — each writes a log entry. */
export async function assetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.assets", "edit");
  const asset = await db.asset.findUnique({ where: { id: str(fd, "id") } });
  if (!asset) return { error: "Asset not found." };
  const action = str(fd, "action");
  const note = str(fd, "note") || null;

  if (action === "assign") {
    if (asset.status !== "available") return { error: "Only available assets can be assigned. Return it first." };
    const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") } });
    if (!emp || emp.status === "left") return { error: "Choose a current employee." };
    await db.asset.update({ where: { id: asset.id }, data: { status: "assigned", assignedToId: emp.id, assignedAt: new Date(), logs: { create: { action: "assigned", employeeId: emp.id, note, byId: user.id } } } });
    await notify(emp.userId, `${asset.name} (${asset.tag}) assigned to you`, { body: note ?? undefined, link: "/me" });
    await audit(user.id, "update", "asset", asset.id, `Assigned ${asset.tag} to ${emp.fullName}`);
    refresh(emp.id);
    return { ok: true, message: `Assigned to ${emp.fullName}.` };
  }
  if (!["return", "repair", "retire", "available"].includes(action)) return { error: "Unknown action." };
  const status = { return: "available", repair: "repair", retire: "retired", available: "available" }[action]!;
  const logAction = { return: "returned", repair: "repair", retire: "retired", available: "available" }[action]!;
  await db.asset.update({
    where: { id: asset.id },
    data: { status, assignedToId: null, assignedAt: null, logs: { create: { action: logAction, employeeId: asset.assignedToId, note, byId: user.id } } },
  });
  await audit(user.id, "update", "asset", asset.id, `${asset.tag}: ${logAction}`);
  refresh(asset.assignedToId);
  return { ok: true, message: action === "return" ? "Returned to stock." : `Marked ${status}.` };
}

export async function deleteAsset(fd: FormData) {
  const user = await requirePermission("hr.assets", "delete");
  const asset = await db.asset.findUnique({ where: { id: str(fd, "id") } });
  if (!asset) return;
  await db.asset.delete({ where: { id: asset.id } });
  await audit(user.id, "delete", "asset", asset.id, `Deleted asset ${asset.tag} ${asset.name}`);
  refresh(asset.assignedToId);
  redirect("/hr/assets");
}
