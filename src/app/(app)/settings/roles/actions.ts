"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { MODULES, scopesFor, type Scope } from "@/lib/rbac";
import { str, type FormState } from "@/lib/utils";

export async function createRole(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.roles", "create");
  const name = str(fd, "name");
  const copyFrom = str(fd, "copyFrom");
  if (name.length < 2) return { error: "Role name is required." };
  if (await db.role.findUnique({ where: { name } })) return { error: "A role with this name already exists." };

  const source = copyFrom ? await db.permission.findMany({ where: { roleId: copyFrom } }) : [];
  const role = await db.role.create({
    data: {
      name,
      description: str(fd, "description") || null,
      permissions: { create: source.map(({ module, action, scope }) => ({ module, action, scope })) },
    },
  });
  await audit(actor.id, "create", "role", role.id, `Created role ${name}`);
  redirect(`/settings/roles/${role.id}`);
}

/** Saves the whole permission matrix. Inputs are named `p:<module>:<action>` with a scope value. */
export async function saveRolePermissions(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.roles", "edit");
  const roleId = str(fd, "roleId");
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { error: "Role not found." };

  const name = str(fd, "name");
  if (name.length < 2) return { error: "Role name is required." };
  const clash = await db.role.findUnique({ where: { name } });
  if (clash && clash.id !== roleId) return { error: "A role with this name already exists." };

  const rows: { roleId: string; module: string; action: string; scope: Scope }[] = [];
  for (const mod of MODULES) {
    const allowed = scopesFor(mod);
    for (const action of mod.actions) {
      const scope = str(fd, `p:${mod.key}:${action}`) as Scope;
      if (scope && scope !== "none" && allowed.includes(scope)) rows.push({ roleId, module: mod.key, action, scope });
    }
  }

  await db.$transaction([
    db.role.update({ where: { id: roleId }, data: { name, description: str(fd, "description") || null } }),
    db.permission.deleteMany({ where: { roleId } }),
    db.permission.createMany({ data: rows }),
  ]);
  await audit(actor.id, "update", "role", roleId, `Updated permissions for role ${name} (${rows.length} grants)`);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteRole(fd: FormData) {
  const actor = await requirePermission("settings.roles", "delete");
  const roleId = str(fd, "roleId");
  const role = await db.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
  if (!role || role._count.users > 0) redirect(`/settings/roles/${roleId}`);
  await db.role.delete({ where: { id: roleId } });
  await audit(actor.id, "delete", "role", roleId, `Deleted role ${role.name}`);
  redirect("/settings/roles");
}
