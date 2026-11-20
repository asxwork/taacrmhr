import Link from "@/components/link";
import { Pencil, Plus, Search, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { managerUserIds } from "@/lib/managers";
import { can, requirePermission } from "@/lib/permissions";
import { fmtAgo } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { DrillTiles } from "@/components/drill-tiles";
import { FilterSelect } from "@/components/filter-select";
import type { Prisma } from "@prisma/client";
import { smtpConfigured } from "@/lib/mail";
import { importUsers, resendLoginEmail, saveUser } from "./actions";
import { SelectAllUsers, UserTick, UsersBulkBar } from "./bulk-bar";

export const metadata = { title: "Users" };

type SP = Promise<{ q?: string; branch?: string; dept?: string; role?: string; status?: string; manager?: string; seen?: string; edit?: string; new?: string; mail?: string; import?: string }>;

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const actor = await requirePermission("settings.users");
  const sp = await searchParams;
  const q = sp.q?.trim();

  // Filters combine: search + department + access (role) + branch + reports to + status + last sign-in.
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const where: Prisma.UserWhereInput = {
    ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }, { title: { contains: q } }] }),
    ...(sp.branch && { branchId: sp.branch === "none" ? null : sp.branch }),
    ...(sp.dept && { employee: sp.dept === "none" ? null : { departmentId: sp.dept } }),
    ...(sp.role && (sp.role === "super" ? { isSuperAdmin: true } : sp.role === "none" ? { isSuperAdmin: false, roles: { none: {} } } : { roles: { some: { roleId: sp.role } } })),
    ...(sp.manager && { managerId: sp.manager === "none" ? null : sp.manager }),
    ...(sp.status === "active" && { active: true }), ...(sp.status === "inactive" && { active: false }),
    ...(sp.seen === "never" && { lastLoginAt: null }), ...(sp.seen === "30" && { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: monthAgo } }] }),
  };
  const [users, branches, roles, departments, counts, allUsers] = await Promise.all([
    db.user.findMany({
      where,
      include: { branch: true, manager: true, employee: { select: { id: true, department: { select: { name: true } }, designation: { select: { name: true } } } }, roles: { include: { role: true } }, _count: { select: { permissionOverrides: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    Promise.all([db.user.count(), db.user.count({ where: { active: true } }), db.user.count({ where: { active: false } }), db.user.count({ where: { lastLoginAt: null } }), db.user.count({ where: { isSuperAdmin: true } })]),
    db.user.findMany({ select: { id: true, name: true, active: true, isSuperAdmin: true, branchId: true, managerId: true, lastLoginAt: true, employee: { select: { departmentId: true } }, roles: { select: { roleId: true } } }, orderBy: { name: "asc" } }),
  ]);
  // How many users each filter choice has (over everyone, so the numbers don't jump as you filter).
  const tally = (test: (u: (typeof allUsers)[number]) => boolean) => allUsers.filter(test).length;
  // Open leads per person (old employees' leads can only be moved by a Super Admin).
  const openLeads = new Map((await db.lead.groupBy({ by: ["ownerId"], where: { ownerId: { in: users.map((u) => u.id) }, status: { kind: "open" } }, _count: true })).map((r) => [r.ownerId, r._count]));
  const everyone = allUsers.filter((u) => u.active);
  const filtersOn = [sp.branch, sp.dept, sp.role, sp.manager, sp.status, sp.seen, q].filter(Boolean).length;

  const editing = sp.edit ? users.find((u) => u.id === sp.edit) ?? (await db.user.findUnique({ where: { id: sp.edit }, include: { roles: true } })) : null;
  const drawerOpen = sp.new !== undefined ? can(actor, "settings.users", "create") : editing ? can(actor, "settings.users", "edit") : false;
  const filterKeys = ["q", "branch", "dept", "role", "manager", "status", "seen"] as const;
  const keepObj = Object.fromEntries(filterKeys.filter((k) => sp[k]).map((k) => [k, sp[k]!]));
  const keep = new URLSearchParams(keepObj).toString();
  const closeHref = `/settings/users${keep ? `?${keep}` : ""}`;
  const editHref = (id: string) => `/settings/users?${new URLSearchParams({ ...keepObj, edit: id })}`;
  const tile = (patch: Record<string, string>) => `/settings/users?${new URLSearchParams(patch)}`;

  const canSeeProfiles = can(actor, "hr.employees");
  const editingEmployee = editing ? await db.employee.findUnique({ where: { userId: editing.id }, select: { id: true } }) : null;
  const managerIds = await managerUserIds(); // "Reports to": only admin / HR / supervisor / manager access
  const canBulk = can(actor, "settings.users", "edit") && !actor.viewAs;
  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in. Roles decide what each person sees."
        actions={
          can(actor, "settings.users", "create") && (
            <div className="flex gap-2">
              <LinkButton href="/settings/users?import=1" variant="secondary" scroll={false}><Upload className="size-4" /> Import users</LinkButton>
              <LinkButton href="/settings/users?new" scroll={false}>
                <Plus className="size-4" /> New user
              </LinkButton>
            </div>
          )
        }
      />

      {sp.mail === "sent" && <p role="status" className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">User created. Welcome email sent, with a link to set their password.</p>}
      {sp.mail && sp.mail !== "sent" && (
        <p role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          User created, but the welcome email {sp.mail === "skipped" ? "wasn't sent because email isn't set up yet" : "failed to send"}. Check <Link href="/settings/integrations" className="underline">Settings → Integrations</Link>, then open the user and use Send login email.
        </p>
      )}

      <DrillTiles className="mb-5 lg:grid-cols-5 xl:grid-cols-5" tiles={[
        { key: "all", label: "All users", tone: "navy", value: counts[0], href: "/settings/users" },
        { key: "active", label: "Active", tone: "green", value: counts[1], href: tile({ status: "active" }) },
        { key: "old", label: "Old employees (inactive)", tone: "slate", value: counts[2], href: tile({ status: "inactive" }) },
        { key: "never", label: "Never signed in", tone: "amber", value: counts[3], href: tile({ seen: "never" }) },
        { key: "super", label: "Super Admins", tone: "gold", value: counts[4], href: tile({ role: "super" }) },
      ]} />

      <Card className="mb-4 p-3">
        <AutoFilterForm className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <div className="relative col-span-full">
            <Search className="absolute left-3 top-2.5 size-4 text-muted" />
            <input name="q" defaultValue={q} aria-label="Search" placeholder="Search name, email, phone or title" className="input pl-9" />
          </div>
          <FilterSelect name="dept" label="Department" value={sp.dept} options={[...departments.map((d) => ({ value: d.id, label: d.name, count: tally((u) => u.employee?.departmentId === d.id) })), { value: "none", label: "No employee record", count: tally((u) => !u.employee) }]} />
          <FilterSelect name="role" label="Access" value={sp.role} options={[
            { value: "super", label: "Super Admin", count: tally((u) => u.isSuperAdmin), hint: "Full access" },
            ...roles.map((r) => ({ value: r.id, label: r.name, count: tally((u) => u.roles.some((x) => x.roleId === r.id)), hint: r.description ?? undefined })),
            { value: "none", label: "No role", count: tally((u) => !u.isSuperAdmin && !u.roles.length) },
          ]} />
          <FilterSelect name="branch" label="Branch" value={sp.branch} options={[...branches.map((b) => ({ value: b.id, label: b.name, count: tally((u) => u.branchId === b.id) })), { value: "none", label: "No branch", count: tally((u) => !u.branchId) }]} />
          <FilterSelect name="manager" label="Team" value={sp.manager} options={[...everyone.filter((u) => managerIds.has(u.id)).map((u) => ({ value: u.id, label: `${u.name}'s team`, count: tally((x) => x.managerId === u.id) })), { value: "none", label: "Reports to nobody", count: tally((u) => !u.managerId) }]} />
          <FilterSelect name="status" label="Status" value={sp.status} allLabel="Active & old" options={[{ value: "active", label: "Active", count: tally((u) => u.active) }, { value: "inactive", label: "Old employees (inactive)", count: tally((u) => !u.active) }]} />
          <FilterSelect name="seen" label="Signed in" value={sp.seen} options={[{ value: "never", label: "Never", count: tally((u) => !u.lastLoginAt) }, { value: "30", label: "Not in 30 days", count: tally((u) => !u.lastLoginAt || u.lastLoginAt < monthAgo) }]} />
        </AutoFilterForm>
        <p className="mt-2 flex items-center gap-3 px-1 text-xs text-muted">
          <span><b className="text-ink tabular-nums">{users.length}</b> user{users.length === 1 ? "" : "s"}{filtersOn ? " match" : ""}</span>
          {filtersOn > 0 && <Link href="/settings/users" className="font-medium text-navy-900 hover:underline">Clear filters</Link>}
        </p>
      </Card>

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState title="No users found" description="Try a different search or branch." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60">
                <tr>
                  {canBulk && <th className="th w-10"><SelectAllUsers /></th>}
                  <th className="th">Name</th>
                  <th className="th">Roles</th>
                  <th className="th">Branch</th>
                  <th className="th">Reports to</th>
                  <th className="th text-right">Open leads</th>
                  <th className="th">Last sign-in</th>
                  <th className="th w-12"><span className="sr-only">Account</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className={u.active ? "hover:bg-canvas/60" : "bg-canvas/40 text-muted"}>
                    {canBulk && <td className="td w-10">{(actor.isSuperAdmin || !u.isSuperAdmin) && <UserTick id={u.id} name={u.name} />}</td>}
                    <td className="td">
                      {/* In Settings the row edits the account; the profile is its own link under the name. */}
                      <div className="flex items-center gap-3">
                        <Link href={editHref(u.id)} scroll={false} className="shrink-0"><Avatar name={u.name} /></Link>
                        <div className="min-w-0">
                          <Link href={editHref(u.id)} scroll={false} className="font-medium hover:underline">{u.name}</Link>
                          <p className="truncate text-xs text-muted">{u.email}{u.employee && canSeeProfiles && <> · <Link href={`/hr/employees/${u.employee.id}?from=users`} className="font-medium text-navy-900 hover:underline">View profile</Link></>}</p>
                          {(u.title || u.employee?.designation || u.employee?.department) && <p className="truncate text-xs text-muted">{[u.title ?? u.employee?.designation?.name, u.employee?.department?.name].filter(Boolean).join(" · ")}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {u.isSuperAdmin && <Badge tone="gold">Super Admin</Badge>}
                        {u.roles.map((r) => (
                          <Badge key={r.roleId} tone="navy">{r.role.name}</Badge>
                        ))}
                        {!u.active && <Badge tone="neutral">Old employee</Badge>}
                        {u._count.permissionOverrides > 0 && <Badge tone="amber">+{u._count.permissionOverrides} exception{u._count.permissionOverrides === 1 ? "" : "s"}</Badge>}
                      </div>
                    </td>
                    <td className="td text-muted">{u.branch?.name ?? "—"}</td>
                    <td className="td text-muted">{u.manager?.name ?? "—"}</td>
                    <td className="td text-right tabular-nums">{openLeads.get(u.id) ? <Link href={`/crm/leads?owner=${u.id}`} className={u.active ? "hover:underline" : "font-medium text-amber-700 hover:underline"} title={u.active ? "Open their leads" : "Old employee's leads: only a Super Admin can move them"}>{openLeads.get(u.id)}</Link> : <span className="text-muted">—</span>}</td>
                    <td className="td text-muted">{u.lastLoginAt ? fmtAgo(u.lastLoginAt) : <span className="text-amber-700">Never</span>}</td>
                    <td className="td text-right">
                      {can(actor, "settings.users", "edit") && <Link href={editHref(u.id)} scroll={false} title="Edit account (roles, branch, password)" aria-label={`Edit account of ${u.name}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"><Pencil className="size-4" /></Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {canBulk && users.length > 0 && (
        <UsersBulkBar roles={roles.map((r) => ({ id: r.id, name: r.name }))} branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          managers={users.filter((u) => u.active && managerIds.has(u.id)).map((u) => ({ id: u.id, name: u.name }))} />
      )}

      {sp.import && can(actor, "settings.users", "create") && (
        <Drawer title="Import users" closeHref={closeHref}>
          <ActionForm action={importUsers} className="space-y-4">
            <p className="text-sm text-muted">
              Upload your employee list as <b className="text-ink">Excel (.xlsx) or CSV</b>. In Bitrix: <i>Employees → Find employee → ⚙ → Export to Excel</i>.
              Needed: a <b className="text-ink">name</b> and <b className="text-ink">email</b> column; mobile, position, department and branch (e.g. DHA, BHD) are used when present.
              People already in AMS (same email or name) are skipped.
            </p>
            <Field label="Employee list"><input name="file" type="file" required accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" /></Field>
            <Field label="Role for new people" hint="Change anyone afterwards, or use the bulk bar to give roles to several at once.">
              <select name="roleId" className="input" defaultValue={roles.find((r) => r.name === "Agent")?.id ?? ""}>
                <option value="">No role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <label className="flex items-start gap-2 rounded-md border border-line p-2.5 text-sm">
              <input type="checkbox" name="activateOld" defaultChecked className="mt-0.5 accent-navy-900" />
              <span><span className="block font-medium">Activate old employees on the list</span><span className="block text-xs text-muted">Someone made inactive (e.g. by the Bitrix lead import) who is on this list gets their login back, with their real email.</span></span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-line p-2.5 text-sm">
              <input type="checkbox" name="sendWelcome" className="mt-0.5 accent-navy-900" disabled={!smtpConfigured()} />
              <span><span className="block font-medium">Send welcome emails</span><span className="block text-xs text-muted">{smtpConfigured() ? "Each new person gets a link to set their password. Leave off to send later." : "Email isn't set up yet. See Settings → Integrations."}</span></span>
            </label>
            <SubmitButton pendingText="Importing…">Import users</SubmitButton>
          </ActionForm>
        </Drawer>
      )}

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
                    .filter((u) => u.active && u.id !== editing?.id && (managerIds.has(u.id) || u.id === editing?.managerId))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </Field>
            </div>

            <fieldset className="min-w-0 space-y-2">
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

            {editing && actor.isSuperAdmin && !actor.viewAs && editing.id !== actor.id && editing.active && (
              <a href={`/api/view-as?user=${editing.id}`} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm hover:bg-canvas/60">
                <span><span className="block font-medium">View as {editing.name}</span><span className="block text-xs text-muted">See exactly their menus and data (read-only), to check their access</span></span>
                <span aria-hidden>→</span>
              </a>
            )}
            {editingEmployee && canSeeProfiles && (
              <Link href={`/hr/employees/${editingEmployee.id}?from=users`} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm hover:bg-canvas/60">
                <span><span className="block font-medium">Open employee profile</span><span className="block text-xs text-muted">Personal details, job and pay, documents, attendance</span></span>
                <span aria-hidden>→</span>
              </Link>
            )}
            {editing && can(actor, "settings.roles") && (
              <Link href={`/settings/users/${editing.id}/access`} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm hover:bg-canvas/60">
                <span><span className="block font-medium">Access exceptions</span><span className="block text-xs text-muted">Give this person more or less than their roles, permission by permission</span></span>
                <span aria-hidden>→</span>
              </Link>
            )}

            {!editing && (
              <label className="flex items-start gap-2 rounded-md border border-line p-2.5 text-sm">
                <input type="checkbox" name="sendWelcome" defaultChecked={smtpConfigured()} className="mt-0.5 accent-navy-900" />
                <span>
                  <span className="block font-medium">Send welcome email</span>
                  <span className="block text-xs text-muted">{smtpConfigured() ? "From your company address, with a link to set their own password." : "Email isn't set up yet. See Settings → Integrations."}</span>
                </span>
              </label>
            )}
            <Field label={editing ? "Reset password" : "Password"} hint={editing ? "Leave blank to keep the current password." : "Optional with the welcome email: leave blank and they choose their own. Otherwise at least 8 characters."}>
              <input name="password" type="password" autoComplete="new-password" className="input" />
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
          {editing && (
            <ActionForm action={resendLoginEmail} className="mt-6 border-t border-line pt-4">
              <input type="hidden" name="id" value={editing.id} />
              <p className="mb-2 text-sm text-muted">Email {editing.email} a link to set a new password. Any earlier link stops working.</p>
              <SubmitButton variant="secondary" pendingText="Sending…">Send login email</SubmitButton>
            </ActionForm>
          )}
        </Drawer>
      )}
    </>
  );
}
