"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

/** Saves the current filter as a named preset for this user. Same name replaces the old one. */
export async function saveLeadFilter(name: string, query: string) {
  const user = await requirePermission("crm.leads");
  const clean = name.trim().slice(0, 60);
  if (!clean) return { error: "Give the filter a name." };
  const q = new URLSearchParams(query.slice(0, 2000)).toString();
  const existing = await db.savedFilter.findFirst({ where: { userId: user.id, module: "crm.leads", name: clean } });
  const saved = existing
    ? await db.savedFilter.update({ where: { id: existing.id }, data: { query: q } })
    : await db.savedFilter.create({ data: { userId: user.id, module: "crm.leads", name: clean, query: q } });
  revalidatePath("/crm/leads");
  return { id: saved.id };
}

export async function deleteLeadFilter(id: string) {
  const user = await requirePermission("crm.leads");
  await db.savedFilter.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/crm/leads");
}
