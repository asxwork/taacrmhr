"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

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

export async function saveLeadSource(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.company", "edit");
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Source name is required." };

  const clash = await db.leadSource.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };

  if (id) {
    await db.leadSource.update({ where: { id }, data: { name, active: fd.get("active") === "on" } });
  } else {
    const last = await db.leadSource.aggregate({ _max: { sortOrder: true } });
    await db.leadSource.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  await audit(actor.id, id ? "update" : "create", "leadSource", id || null, `${id ? "Updated" : "Added"} lead source ${name}`);
  return done();
}
