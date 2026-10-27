"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import { APPEARANCE_KEYS, readAppearanceForm } from "@/lib/appearance-server";
import { deleteUpload } from "@/lib/files";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { loadDemo, removeDemo } from "@/lib/demo-data";

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

/** Super Admin only. Sample staff get random passwords nobody knows, so they can't be signed into. */
export async function loadSampleData(): Promise<FormState> {
  const actor = await requireUser();
  if (!actor.isSuperAdmin) return { error: "Only a Super Admin can load sample data." };
  const res = await loadDemo(db, { passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 10), domain: "demo.local", withSuperAdmin: false, codePrefix: "DEMO-" });
  if ("error" in res) return { error: res.error };
  await audit(actor.id, "create", "setting", "demo.data", "Loaded sample data");
  revalidatePath("/", "layout");
  return { ok: true, message: `Loaded ${res.employees} sample employees with leads, deals, inventory, attendance and salaries.` };
}

export async function removeSampleData(): Promise<FormState> {
  const actor = await requireUser();
  if (!actor.isSuperAdmin) return { error: "Only a Super Admin can remove sample data." };
  const res = await removeDemo(db);
  if ("error" in res) return { error: res.error };
  await audit(actor.id, "delete", "setting", "demo.data", `Removed sample data (${res.users} users)`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Sample data removed." };
}
