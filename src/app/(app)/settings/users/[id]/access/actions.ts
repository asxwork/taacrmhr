"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { MODULES, scopesFor, type Scope } from "@/lib/rbac";
import { str, type FormState } from "@/lib/utils";

/** Saves a user's access exceptions. Inputs `o:<module>:<action>`: empty = follow their roles, else the scope to use. */
export async function saveUserAccess(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.roles", "edit");
  const userId = str(fd, "userId");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found." };
  if (user.isSuperAdmin) return { error: "Super Admins always have full access; exceptions don't apply." };
  const rows: { userId: string; module: string; action: string; scope: Scope }[] = [];
  for (const mod of MODULES) {
    for (const action of mod.actions) {
      const v = str(fd, `o:${mod.key}:${action}`) as Scope | "";
      if (v && scopesFor(mod).includes(v)) rows.push({ userId, module: mod.key, action, scope: v });
    }
  }
  await db.$transaction([db.userPermission.deleteMany({ where: { userId } }), db.userPermission.createMany({ data: rows })]);
  await audit(actor.id, "update", "user", userId, `Access exceptions for ${user.name}: ${rows.length ? rows.map((r) => `${r.module}.${r.action}=${r.scope}`).join(", ") : "none (follows roles)"}`);
  revalidatePath("/", "layout");
  return { ok: true, message: rows.length ? `${rows.length} exception(s) saved. They apply on ${user.name}'s next page load.` : `${user.name} now follows their roles only.` };
}
