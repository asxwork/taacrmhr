"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

async function editor() {
  const user = await requireUser();
  return user.isSuperAdmin || can(user, "inventory.projects", "edit") || can(user, "inventory.projects", "create") ? user : null;
}
const opt = (fd: FormData, k: string, max = 200) => str(fd, k).slice(0, max) || null;

/** Add / edit a developer. Renaming updates the projects that use the old name. */
export async function saveDeveloper(_: FormState, fd: FormData): Promise<FormState> {
  const user = await editor();
  if (!user) return { error: "Not allowed." };
  const id = str(fd, "id");
  const name = str(fd, "name").slice(0, 120);
  if (!name) return { error: "Developer name is required." };
  const clash = await db.developer.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };
  const website = opt(fd, "website");
  const data = { name, contactName: opt(fd, "contactName"), phone: opt(fd, "phone", 40), email: opt(fd, "email"), website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website, notes: opt(fd, "notes", 2000) };
  const old = id ? await db.developer.findUnique({ where: { id } }) : null;
  const d = old ? await db.developer.update({ where: { id: old.id }, data }) : await db.developer.create({ data });
  if (old && old.name !== name) await db.project.updateMany({ where: { developer: old.name }, data: { developer: name } });
  await audit(user.id, old ? "update" : "create", "developer", d.id, `Developer ${name}`);
  revalidatePath("/inventory", "layout");
  redirect(`/inventory/developers/${d.id}`);
}

export async function deleteDeveloper(fd: FormData) {
  const user = await editor();
  if (!user) return;
  const d = await db.developer.findUnique({ where: { id: str(fd, "id") } });
  if (!d || (await db.project.count({ where: { developer: d.name } }))) return;
  await db.developer.delete({ where: { id: d.id } });
  await audit(user.id, "delete", "developer", d.id, `Deleted developer ${d.name}`);
  revalidatePath("/inventory", "layout");
  redirect("/inventory?tab=developers");
}

/** Add / edit an area. Renaming updates projects (location) and listings (area) that use the old name. */
export async function saveArea(_: FormState, fd: FormData): Promise<FormState> {
  const user = await editor();
  if (!user) return { error: "Not allowed." };
  const id = str(fd, "id");
  const name = str(fd, "name").slice(0, 80);
  if (!name) return { error: "Area name is required." };
  const clash = await db.inventoryArea.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };
  const data = { name, city: str(fd, "city").slice(0, 60) || "Karachi", notes: opt(fd, "notes", 2000) };
  const old = id ? await db.inventoryArea.findUnique({ where: { id } }) : null;
  const a = old ? await db.inventoryArea.update({ where: { id: old.id }, data }) : await db.inventoryArea.create({ data });
  if (old && old.name !== name) {
    await db.project.updateMany({ where: { location: old.name }, data: { location: name } });
    await db.unit.updateMany({ where: { area: old.name }, data: { area: name } });
  }
  await audit(user.id, old ? "update" : "create", "area", a.id, `Area ${name}`);
  revalidatePath("/inventory", "layout");
  redirect(`/inventory/areas/${a.id}`);
}

export async function deleteArea(fd: FormData) {
  const user = await editor();
  if (!user) return;
  const a = await db.inventoryArea.findUnique({ where: { id: str(fd, "id") } });
  if (!a || (await db.project.count({ where: { location: a.name } })) || (await db.unit.count({ where: { area: a.name } }))) return;
  await db.inventoryArea.delete({ where: { id: a.id } });
  await audit(user.id, "delete", "area", a.id, `Deleted area ${a.name}`);
  revalidatePath("/inventory", "layout");
  redirect("/inventory?tab=areas");
}
