"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import { APPEARANCE_KEYS, readAppearanceForm } from "@/lib/appearance-server";
import { deleteUpload } from "@/lib/files";

const done = (): FormState => {
  revalidatePath("/settings/company");
  return { ok: true };
};

export async function saveCompany(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.company", "edit");
  const name = str(fd, "name");
  if (!name) return { error: "Company name is required." };
  await db.setting.upsert({ where: { key: "company.name" }, update: { value: name }, create: { key: "company.name", value: name } });
  await audit(actor.id, "update", "setting", "company.name", `Company name set to ${name}`);
  return done();
}

export async function saveBranch(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.company", "edit");
  const id = str(fd, "id");
  const name = str(fd, "name");
  const code = str(fd, "code").toUpperCase();
  if (!name || !code) return { error: "Branch name and code are required." };

  const clash = await db.branch.findFirst({ where: { OR: [{ name }, { code }], NOT: id ? { id } : undefined } });
  if (clash) return { error: "Another branch already uses this name or code." };

  const data = { name, code, address: str(fd, "address") || null, active: id ? fd.get("active") === "on" : true };
  const branch = id ? await db.branch.update({ where: { id }, data }) : await db.branch.create({ data });
  await audit(actor.id, id ? "update" : "create", "branch", branch.id, `${id ? "Updated" : "Added"} branch ${name}`);
  return done();
}

export async function saveCompanyAppearance(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.company", "edit");
  const res = await readAppearanceForm(fd, "wallpapers/company", false);
  if ("error" in res) return { error: res.error };
  const current = await db.setting.findUnique({ where: { key: APPEARANCE_KEYS.wallpaper } });
  const set = (key: string, value: string) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  if (res.theme) await set(APPEARANCE_KEYS.theme, res.theme);
  if (res.accent) await set(APPEARANCE_KEYS.accent, res.accent);
  if (res.wallpaper && res.wallpaper !== "keep") {
    if (current?.value.startsWith("upload:") && current.value !== res.wallpaper) await deleteUpload(current.value.slice(7));
    await set(APPEARANCE_KEYS.wallpaper, res.wallpaper);
  }
  await audit(actor.id, "update", "setting", "appearance", "Updated company appearance defaults");
  revalidatePath("/", "layout");
  return { ok: true, message: "Company defaults saved." };
}
