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
  revalidatePath("/settings/roles");
  redirect(`/settings/roles#role-${role.id}`);
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

/** One cell of the access matrix, saved the moment it changes. "none" removes the grant. */
export async function setPermission(roleId: string, module: string, action: string, scope: string): Promise<{ error?: string }> {
  const actor = await requirePermission("settings.roles", "edit");
  const mod = MODULES.find((m) => m.key === module);
  if (!mod || !(mod.actions as readonly string[]).includes(action) || !scopesFor(mod).includes(scope as Scope)) return { error: "Not allowed." };
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { error: "Role not found." };
  if (scope === "none") await db.permission.deleteMany({ where: { roleId, module, action } });
  else await db.permission.upsert({ where: { roleId_module_action: { roleId, module, action } }, update: { scope }, create: { roleId, module, action, scope } });
  await audit(actor.id, "update", "role", roleId, `${role.name}: ${mod.label} · ${action} → ${scope}`);
  revalidatePath("/", "layout");
  return {};
}

/** Replaces the role's members with the ticked users. Anyone can hold any number of roles. */
export async function setRoleMembers(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.roles", "edit");
  const roleId = str(fd, "roleId");
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { error: "Role not found." };
  const userIds = [...new Set(fd.getAll("userIds").map(String))];
  const valid = (await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true } })).map((u) => u.id);
  if (role.maxUsers && valid.length > role.maxUsers) return { error: `Only ${role.maxUsers === 1 ? "one person" : `${role.maxUsers} people`} can have the ${role.name} role.` };
  await db.userRole.deleteMany({ where: { roleId, userId: { notIn: valid } } });
  const have = new Set((await db.userRole.findMany({ where: { roleId }, select: { userId: true } })).map((r) => r.userId));
  for (const userId of valid) if (!have.has(userId)) await db.userRole.create({ data: { userId, roleId } });
  await audit(actor.id, "update", "role", roleId, `${role.name}: ${valid.length} member(s)`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Members saved." };
}
