import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ACTIONS, ACTION_LABELS, MODULES, SCOPE_LABELS, maxScope, permKey, scopesFor, type Action, type Scope } from "@/lib/rbac";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ScopeSelect } from "../../../roles/[id]/scope-select";
import { saveUserAccess } from "./actions";

export const metadata = { title: "User access" };

const GROUPS = ["CRM", "Inventory", "Calls", "HR", "Finance", "Reports", "Settings"] as const;

/** Settings → Users → Access: what this person's roles give, and per-permission exceptions on top. */
export default async function UserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("settings.roles");
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  if (!user) notFound();
  const overrides = await db.userPermission.findMany({ where: { userId: id } });
  const fromRoles: Record<string, Scope> = {};
  for (const { role } of user.roles) for (const p of role.permissions) fromRoles[permKey(p.module, p.action as Action)] = maxScope(fromRoles[permKey(p.module, p.action as Action)] ?? "none", p.scope as Scope);
  const over = Object.fromEntries(overrides.map((o) => [permKey(o.module, o.action as Action), o.scope]));
  const editable = can(actor, "settings.roles", "edit") && !user.isSuperAdmin;
  // Short labels so every cell fits: the full wording is in the legend above the grid.
  const SHORT: Record<Scope, string> = { none: "No", own: "Own", team: "Team", branch: "Branch", all: "All" };
  const label = (m: (typeof MODULES)[number], s: Scope) => (m.scoped ? SHORT[s] : s === "all" ? "Yes" : "No");

  return (
    <>
      <Link href={`/settings/users?edit=${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Users</Link>
      <PageHeader title={`Access — ${user.name}`}
        description={user.isSuperAdmin ? "Super Admin: full access to everything; roles and exceptions don't apply."
          : `Roles: ${user.roles.map((r) => r.role.name).join(", ") || "none"}. Leave a cell on “Role default” to follow the roles, or pick a level to give this person more or less than their role.`} />
      <p className="mb-4 text-xs text-muted">{(Object.keys(SCOPE_LABELS) as Scope[]).filter((s) => s !== "none").map((s) => `${SHORT[s]} = ${SCOPE_LABELS[s].toLowerCase()}`).join(" · ")} · “Role: …” = follows their roles</p>
      {overrides.length > 0 && <p className="mb-4 text-sm"><Badge tone="amber">{overrides.length} exception{overrides.length === 1 ? "" : "s"}</Badge> <span className="text-muted">Cells with an exception are highlighted.</span></p>}
      <ActionForm action={saveUserAccess} successMessage="Saved.">
        <input type="hidden" name="userId" value={id} />
        <fieldset disabled={!editable} className="min-w-0 space-y-6">
          {GROUPS.map((group) => (
            <Card key={group} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] table-fixed">
                  <thead className="border-b border-line bg-canvas/60">
                    <tr>
                      <th className="th w-56">{group}</th>
                      {ACTIONS.map((a) => <th key={a} className="th text-center">{ACTION_LABELS[a]}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {MODULES.filter((m) => m.group === group).map((m) => (
                      <tr key={m.key}>
                        <td className="td font-medium">{m.label}</td>
                        {ACTIONS.map((a) => {
                          const k = permKey(m.key, a);
                          if (!m.actions.includes(a)) return <td key={a} className="px-2 py-2 text-center text-muted/40">—</td>;
                          const base = fromRoles[k] ?? "none";
                          return (
                            <td key={a} className={over[k] ? "bg-amber-50 px-2 py-2 text-center" : "px-2 py-2 text-center"}>
                              <ScopeSelect name={`o:${k}`} defaultValue={over[k] ?? ""}
                                options={[{ value: "", label: `Role: ${label(m, base)}` }, ...scopesFor(m).map((s) => ({ value: s, label: label(m, s) }))]} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
          {editable && <div className="sticky bottom-4 flex justify-end"><SubmitButton className="shadow-lg">Save access</SubmitButton></div>}
        </fieldset>
      </ActionForm>
    </>
  );
}
