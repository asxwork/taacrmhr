import Link from "next/link";
import { Briefcase, Building2, ChartBar, Plus, Search, Settings2, ShieldCheck, Target } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ACTION_LABELS, MODULES, SCOPE_LABELS, scopesFor, type ModuleDef } from "@/lib/rbac";
import { cn, initials } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, Field, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { PermCell } from "./perm-cell";
import { createRole, setRoleMembers } from "./actions";

export const metadata = { title: "Access permissions" };

const GROUPS: { key: ModuleDef["group"]; icon: typeof Target; tone: string }[] = [
  { key: "CRM", icon: Target, tone: "bg-emerald-500" },
  { key: "Inventory", icon: Building2, tone: "bg-sky-500" },
  { key: "HR", icon: Briefcase, tone: "bg-violet-500" },
  { key: "Reports", icon: ChartBar, tone: "bg-amber-500" },
  { key: "Settings", icon: Settings2, tone: "bg-slate-500" },
];
// Bitrix's five first, then the original roles, then custom ones A–Z.
const ORDER = ["Administrator", "Supervisor", "Deputy supervisor", "Agent", "Observer", "Sales Manager", "HR Manager", "Employee"];

/** Bitrix-style access matrix: roles across, permissions down, every cell editable in place. */
export default async function AccessPermissionsPage({ searchParams }: { searchParams: Promise<{ q?: string; members?: string; new?: string }> }) {
  const actor = await requirePermission("settings.roles");
  const sp = await searchParams;
  const canEdit = can(actor, "settings.roles", "edit");
  const canCreate = can(actor, "settings.roles", "create");
  const [rolesRaw, users, superAdmins] = await Promise.all([
    db.role.findMany({ include: { permissions: true, users: { include: { user: { select: { id: true, name: true, active: true } } } } } }),
    sp.members ? db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, title: true }, orderBy: { name: "asc" } }) : [],
    db.user.count({ where: { isSuperAdmin: true, active: true } }),
  ]);
  const rank = (n: string) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
  const roles = rolesRaw.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  const q = sp.q?.trim().toLowerCase();
  const modules = MODULES.filter((m) => !q || m.label.toLowerCase().includes(q) || m.group.toLowerCase().includes(q));
  const membersRole = sp.members ? roles.find((r) => r.id === sp.members) : null;

  return (
    <>
      <PageHeader
        title="Access permissions"
        description="Roles across the top, permissions down the side. Click any value to change it; it saves at once and applies on each user's next page."
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Sections */}
        <nav className="hidden xl:sticky xl:top-6 xl:block" aria-label="Sections">
          {GROUPS.map((g) => {
            const mods = modules.filter((m) => m.group === g.key);
            if (!mods.length) return null;
            return (
              <div key={g.key} className="mb-4">
                <a href={`#g-${g.key}`} className="mb-1 inline-flex items-center gap-2 rounded-full bg-navy-900 px-3 py-1 text-xs font-semibold text-white">{g.key}</a>
                <ul>
                  {mods.map((m) => (
                    <li key={m.key}><a href={`#m-${m.key}`} className="block truncate rounded-md px-3 py-1.5 text-sm text-ink/80 hover:bg-canvas hover:text-ink">{m.label}</a></li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-3">
          <AutoFilterForm className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={sp.q} placeholder="Find a section, e.g. Leads, Payroll" className="input pl-9" />
            </label>
            <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
              <ShieldCheck className="size-4 text-gold-600" /> {superAdmins} Super Admin{superAdmins === 1 ? "" : "s"} always have full access
            </span>
          </AutoFilterForm>

          <Card className="overflow-hidden">
            <div className="max-h-[calc(100vh-12rem)] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 min-w-56 border-b border-r border-line bg-surface px-4 py-3 text-left font-medium">Roles <span className="font-normal text-muted">{roles.length}</span></th>
                    {roles.map((r) => (
                      <th key={r.id} id={`role-${r.id}`} className="sticky top-0 z-20 min-w-40 border-b border-r border-line bg-surface px-3 py-3 text-center align-top font-normal">
                        <Link href={`/settings/roles/${r.id}`} className="block truncate font-medium hover:underline" title={r.description ?? undefined}>{r.name}</Link>
                        <div className="mt-1.5 flex items-center justify-center gap-1">
                          <span className="flex -space-x-1.5">
                            {r.users.slice(0, 4).map((u) => (
                              <span key={u.user.id} title={u.user.name} className="flex size-6 items-center justify-center rounded-full bg-navy-900/10 text-[9px] font-semibold text-navy-900 ring-2 ring-surface">{initials(u.user.name)}</span>
                            ))}
                          </span>
                          {r.users.length > 4 && <span className="text-xs text-muted">+{r.users.length - 4}</span>}
                          {canEdit && (
                            <Link href={`/settings/roles?members=${r.id}`} scroll={false} title="Choose who has this role" aria-label={`Members of ${r.name}`}
                              className="flex size-6 items-center justify-center rounded-full text-navy-900 ring-1 ring-navy-900/30 hover:bg-navy-900 hover:text-white">
                              <Plus className="size-3.5" />
                            </Link>
                          )}
                        </div>
                      </th>
                    ))}
                    {canCreate && (
                      <th className="sticky top-0 z-20 min-w-36 border-b border-line bg-surface px-3 py-3 align-top font-normal">
                        <Link href="/settings/roles?new=1" scroll={false} className="inline-flex items-center gap-1 text-sm text-navy-900 hover:underline"><Plus className="size-4" /> New role</Link>
                      </th>
                    )}
                  </tr>
                </thead>
                {GROUPS.map((g) => {
                  const mods = modules.filter((m) => m.group === g.key);
                  if (!mods.length) return null;
                  return (
                    <tbody key={g.key} id={`g-${g.key}`}>
                      <tr>
                        <td colSpan={roles.length + 2} className="sticky left-0 border-b border-line bg-canvas px-4 py-2">
                          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                            <span className={cn("flex size-5 items-center justify-center rounded-full text-white", g.tone)}><g.icon className="size-3" /></span>{g.key}
                          </span>
                        </td>
                      </tr>
                      {mods.map((m) => (
                        <ModuleRows key={m.key} m={m} roles={roles} canEdit={canEdit} extraCol={canCreate} />
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted">
            <b className="font-medium text-ink">Only their own items</b> = records they&apos;re responsible for · <b className="font-medium text-ink">Their team&apos;s items</b> = theirs plus everyone who reports to them (set &quot;Reports to&quot; on the employee or user) · <b className="font-medium text-ink">Their branch&apos;s items</b> = their branch. A user with several roles gets the widest access of them all.
          </p>
        </div>
      </div>

      {membersRole && canEdit && (
        <Drawer title={`Who has “${membersRole.name}”`} closeHref="/settings/roles">
          <ActionForm action={setRoleMembers} className="space-y-4">
            <input type="hidden" name="roleId" value={membersRole.id} />
            <p className="text-sm text-muted">Tick everyone who should have this role. People can have several roles; they get the widest access across them.</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {users.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-canvas">
                    <input type="checkbox" name="userIds" value={u.id} defaultChecked={membersRole.users.some((x) => x.user.id === u.id)} className="size-4 accent-navy-900" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{u.name}</span>
                      <span className="block truncate text-xs text-muted">{[u.title, u.email].filter(Boolean).join(" · ")}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <SubmitButton>Save members</SubmitButton>
          </ActionForm>
        </Drawer>
      )}

      {sp.new && canCreate && (
        <Drawer title="New role" closeHref="/settings/roles">
          <ActionForm action={createRole} className="space-y-4">
            <Field label="Role name"><input name="name" required className="input" placeholder="e.g. Team Lead, Call Centre" autoFocus /></Field>
            <Field label="Description"><input name="description" className="input" /></Field>
            <Field label="Start from" hint="Copy an existing role's permissions, then adjust them in the table.">
              <select name="copyFrom" className="input">
                <option value="">Nothing (no access)</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <SubmitButton>Create role</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}

function ModuleRows({ m, roles, canEdit, extraCol }: {
  m: ModuleDef;
  roles: { id: string; name: string; permissions: { module: string; action: string; scope: string }[] }[];
  canEdit: boolean;
  extraCol: boolean;
}) {
  const options = scopesFor(m).map((s) => ({ value: s, label: m.scoped ? SCOPE_LABELS[s] : s === "all" ? "Allowed" : "Deny access" }));
  return (
    <>
      <tr id={`m-${m.key}`} className="scroll-mt-16">
        <td className="sticky left-0 z-10 border-b border-r border-line bg-surface px-4 pb-1 pt-3 font-medium">{m.label}</td>
        {roles.map((r) => <td key={r.id} className="border-b border-r border-line bg-surface" />)}
        {extraCol && <td className="border-b border-line bg-surface" />}
      </tr>
      {m.actions.map((a) => (
        <tr key={a} className="group">
          <td className="sticky left-0 z-10 border-b border-r border-line bg-surface py-2.5 pl-8 pr-4 text-ink/80 group-hover:bg-canvas">{ACTION_LABELS[a]}</td>
          {roles.map((r) => (
            <td key={r.id} className="border-b border-r border-line px-2 py-2.5 text-center group-hover:bg-canvas/60">
              <PermCell roleId={r.id} module={m.key} action={a} value={r.permissions.find((p) => p.module === m.key && p.action === a)?.scope ?? "none"} options={options} disabled={!canEdit} />
            </td>
          ))}
          {extraCol && <td className="border-b border-line group-hover:bg-canvas/60" />}
        </tr>
      ))}
    </>
  );
}
