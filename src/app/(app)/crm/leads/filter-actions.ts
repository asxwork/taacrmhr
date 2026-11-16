"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";

/** Saves the current filter as a named preset for this user. Same name replaces the old one. */
export async function saveLeadFilter(name: string, query: string, folder = "", share = false) {
  const user = await requirePermission("crm.leads");
  const clean = name.trim().slice(0, 60);
  if (!clean) return { error: "Give the filter a name." };
  // Sharing with everyone: Super Admins and people who manage company settings.
  const shared = share && (user.isSuperAdmin || can(user, "settings.company", "edit"));
  const q = new URLSearchParams(query.slice(0, 2000)).toString();
  const data = { query: q, folder: folder.trim().slice(0, 40) || null, shared };
  const existing = await db.savedFilter.findFirst({ where: { userId: user.id, module: "crm.leads", name: clean } });
  const saved = existing
    ? await db.savedFilter.update({ where: { id: existing.id }, data })
    : await db.savedFilter.create({ data: { userId: user.id, module: "crm.leads", name: clean, ...data } });
  revalidatePath("/crm/leads");
  return { id: saved.id };
}

export async function deleteLeadFilter(id: string) {
  const user = await requirePermission("crm.leads");
  // Your own filters; shared ones also by Super Admins / settings managers.
  const manage = user.isSuperAdmin || can(user, "settings.company", "edit");
  await db.savedFilter.deleteMany({ where: { id, OR: [{ userId: user.id }, ...(manage ? [{ shared: true }] : [])] } });
  revalidatePath("/crm/leads");
}
