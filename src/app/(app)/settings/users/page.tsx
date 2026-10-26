import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { fmtAgo } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { saveUser } from "./actions";

export const metadata = { title: "Users" };

type SP = Promise<{ q?: string; branch?: string; edit?: string; new?: string }>;

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const actor = await requirePermission("settings.users");
  const sp = await searchParams;
  const q = sp.q?.trim();

  const [users, branches, roles] = await Promise.all([
    db.user.findMany({
      where: {
        ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }),
        ...(sp.branch && { branchId: sp.branch }),
      },
      include: { branch: true, manager: true, roles: { include: { role: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  const editing = sp.edit ? users.find((u) => u.id === sp.edit) ?? (await db.user.findUnique({ where: { id: sp.edit }, include: { roles: true } })) : null;
  const drawerOpen = sp.new !== undefined ? can(actor, "settings.users", "create") : editing ? can(actor, "settings.users", "edit") : false;
  const keep = new URLSearchParams({ ...(q && { q }), ...(sp.branch && { branch: sp.branch }) }).toString();
  const closeHref = `/settings/users${keep ? `?${keep}` : ""}`;
  const editHref = (id: string) => `/settings/users?${new URLSearchParams({ ...(q && { q }), ...(sp.branch && { branch: sp.branch }), edit: id })}`;

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in. Roles decide what each person sees."
        actions={
          can(actor, "settings.users", "create") && (
            <LinkButton href="/settings/users?new" scroll={false}>
              <Plus className="size-4" /> New user
            </LinkButton>
          )
        }
      />

      <AutoFilterForm className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted" />
          <input name="q" defaultValue={q} aria-label="Search" placeholder="Search name, email or phone" className="input pl-9" />
        </div>
        <select name="branch" defaultValue={sp.branch ?? ""} className="input w-44">
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </AutoFilterForm>

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState title="No users found" description="Try a different search or branch." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Roles</th>
                  <th className="th">Branch</th>
                  <th className="th">Reports to</th>
                  <th className="th">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className={u.active ? "hover:bg-canvas/60" : "opacity-50"}>
                    <td className="td">
                      <Link href={editHref(u.id)} scroll={false} className="flex items-center gap-3">
                        <Avatar name={u.name} />
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted">{u.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {u.isSuperAdmin && <Badge tone="gold">Super Admin</Badge>}
                        {u.roles.map((r) => (
                          <Badge key={r.roleId} tone="navy">{r.role.name}</Badge>
                        ))}
                        {!u.active && <Badge tone="red">Inactive</Badge>}
                      </div>
                    </td>
                    <td className="td text-muted">{u.branch?.name ?? "—"}</td>
                    <td className="td text-muted">{u.manager?.name ?? "—"}</td>
                    <td className="td text-muted">{fmtAgo(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {drawerOpen && (
        <Drawer title={editing ? `Edit ${editing.name}` : "New user"} closeHref={closeHref}>
          <ActionForm action={saveUser} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Full name">
              <input name="name" required defaultValue={editing?.name} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <input name="email" type="email" required defaultValue={editing?.email} className="input" />
              </Field>
              <Field label="Phone">
                <input name="phone" defaultValue={editing?.phone ?? ""} className="input" placeholder="03xx-xxxxxxx" />
              </Field>
            </div>
            <Field label="Job title">
              <input name="title" defaultValue={editing?.title ?? ""} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch">
                <select name="branchId" defaultValue={editing?.branchId ?? ""} className="input">
                  <option value="">—</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reports to" hint="Defines their team for “Team” scope.">
                <select name="managerId" defaultValue={editing?.managerId ?? ""} className="input">
                  <option value="">—</option>
                  {users
                    .filter((u) => u.active && u.id !== editing?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-xs font-medium text-ink/80">Roles</legend>
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-2.5 hover:bg-canvas/60">
                  <input type="checkbox" name="roleIds" value={r.id} defaultChecked={editing?.roles.some((ur) => ur.roleId === r.id)} className="mt-0.5 accent-navy-900" />
                  <span>
                    <span className="block text-sm font-medium">{r.name}</span>
                    {r.description && <span className="block text-xs text-muted">{r.description}</span>}
                  </span>
                </label>
              ))}
            </fieldset>

            <Field label={editing ? "Reset password" : "Initial password"} hint={editing ? "Leave blank to keep the current password." : "At least 8 characters. They can change it later."}>
              <input name="password" type="password" autoComplete="new-password" required={!editing} className="input" />
            </Field>

            <div className="space-y-2 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} disabled={editing?.id === actor.id} className="accent-navy-900" />
                Active (can sign in)
              </label>
              {actor.isSuperAdmin && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isSuperAdmin" defaultChecked={editing?.isSuperAdmin} disabled={editing?.id === actor.id} className="accent-navy-900" />
                  Super Admin <span className="text-muted">— full access, ignores roles</span>
                </label>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <SubmitButton>{editing ? "Save changes" : "Create user"}</SubmitButton>
              <LinkButton href={closeHref} variant="ghost" scroll={false}>Cancel</LinkButton>
            </div>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
