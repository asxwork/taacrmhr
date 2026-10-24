import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ACTIONS, MODULES, SCOPE_LABELS, permKey, scopesFor, type Action } from "@/lib/rbac";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Field, PageHeader } from "@/components/ui";
import { ScopeSelect } from "./scope-select";
import { deleteRole, saveRolePermissions } from "../actions";

export const metadata = { title: "Edit role" };

const GROUPS = ["CRM", "Inventory", "HR", "Reports", "Settings"] as const;

export default async function RoleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("settings.roles");
  const { id } = await params;
  const role = await db.role.findUnique({
    where: { id },
    include: { permissions: true, users: { include: { user: { select: { name: true } } } } },
  });
  if (!role) notFound();

  const current = Object.fromEntries(role.permissions.map((p) => [permKey(p.module, p.action as Action), p.scope]));
  const editable = can(actor, "settings.roles", "edit");

  return (
    <>
      <Link href="/settings/roles" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Roles
      </Link>
      <PageHeader
        title={role.name}
        description={role.users.length ? `Assigned to ${role.users.map((u) => u.user.name).join(", ")}` : "Not assigned to anyone yet."}
      />

      <ActionForm action={saveRolePermissions} successMessage="Permissions saved. Changes apply on the user's next page load.">
        <input type="hidden" name="roleId" value={role.id} />
        <fieldset disabled={!editable} className="space-y-6">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Role name">
              <input name="name" defaultValue={role.name} required className="input" />
            </Field>
            <Field label="Description">
              <input name="description" defaultValue={role.description ?? ""} className="input" />
            </Field>
          </Card>

          <p className="text-xs text-muted">
            <b className="font-medium text-ink">Own</b> = records assigned to them · <b className="font-medium text-ink">Team</b> = theirs + people reporting to them ·{" "}
            <b className="font-medium text-ink">Branch</b> = everything in their branch · <b className="font-medium text-ink">All</b> = whole company
          </p>

          {GROUPS.map((group) => (
            <Card key={group} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed">
                  <thead className="border-b border-line bg-canvas/60">
                    <tr>
                      <th className="th w-60">{group}</th>
                      {ACTIONS.map((a) => (
                        <th key={a} className="th text-center capitalize">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {MODULES.filter((m) => m.group === group).map((m) => (
                      <tr key={m.key}>
                        <td className="td font-medium">
                          {m.label}
                          {!m.scoped && <span className="ml-2"><Badge>on/off</Badge></span>}
                        </td>
                        {ACTIONS.map((a) => (
                          <td key={a} className="px-2 py-2 text-center">
                            {m.actions.includes(a) ? (
                              <ScopeSelect
                                name={`p:${m.key}:${a}`}
                                defaultValue={current[permKey(m.key, a)] ?? "none"}
                                options={scopesFor(m).map((s) => ({ value: s, label: m.scoped ? SCOPE_LABELS[s] : s === "all" ? "Yes" : "No" }))}
                              />
                            ) : (
                              <span className="text-muted/40">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {editable && (
            <div className="sticky bottom-4 flex justify-end">
              <SubmitButton className="shadow-lg">Save permissions</SubmitButton>
            </div>
          )}
        </fieldset>
      </ActionForm>

      {can(actor, "settings.roles", "delete") && (
        <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">Delete role</p>
            <p className="text-sm text-muted">{role.users.length ? "Remove this role from all users before deleting it." : "This cannot be undone."}</p>
          </div>
          <form action={deleteRole}>
            <input type="hidden" name="roleId" value={role.id} />
            <Button variant="danger" disabled={role.users.length > 0}>Delete role</Button>
          </form>
        </Card>
      )}
    </>
  );
}
