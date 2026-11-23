import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ACTION_LABELS, MODULES, maxScope, permKey, scopesFor, type Action, type Scope } from "@/lib/rbac";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, PageHeader } from "@/components/ui";
import { AccessEditor, type AccessRow } from "./access-editor";
import { saveUserAccess } from "./actions";

export const metadata = { title: "User access" };

const ORDERED = ["CRM", "Inventory", "Calls", "HR", "Finance", "Reports", "Settings"];
// Every app's permissions: groups not in the list above are added at the end automatically.
const GROUPS = [...ORDERED, ...[...new Set(MODULES.map((m) => m.group))].filter((g) => !ORDERED.includes(g))];

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
  // Plain words for each level ("Only their own" etc. for scoped features; Yes / No for on-off ones).
  const WORDS: Record<Scope, string> = { none: "No access", own: "Own only", team: "Team", branch: "Branch", all: "Everyone" };
  const word = (m: (typeof MODULES)[number], s: Scope) => (m.scoped ? WORDS[s] : s === "all" ? "Yes" : "No");
  const rows: AccessRow[] = MODULES.map((m) => ({
    key: m.key, label: m.label, group: m.group,
    actions: m.actions.map((a) => ({ key: a, label: ACTION_LABELS[a], base: word(m, fromRoles[permKey(m.key, a)] ?? "none"), value: over[permKey(m.key, a)] ?? "", options: scopesFor(m).map((s) => ({ value: s, label: word(m, s) })) })),
  }));
  const groups = GROUPS.filter((g) => rows.some((r) => r.group === g));

  return (
    <>
      <Link href={`/settings/users?edit=${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Users</Link>
      <PageHeader title={`Access — ${user.name}`}
        description={user.isSuperAdmin ? "Super Admin: full access to everything; roles and exceptions don't apply."
          : `Roles: ${user.roles.map((r) => r.role.name).join(", ") || "none"}. Everything follows their roles; change a box to give this person more or less than their role.`} />
      {overrides.length > 0 && <p className="mb-4 text-sm"><Badge tone="amber">{overrides.length} exception{overrides.length === 1 ? "" : "s"}</Badge> <span className="text-muted">Highlighted in amber; “role” means it follows their roles.</span></p>}
      <ActionForm action={saveUserAccess} successMessage="Saved.">
        <input type="hidden" name="userId" value={id} />
        <AccessEditor rows={rows} groups={groups} disabled={!editable} />
        {editable && <div className="sticky bottom-4 mt-4 flex justify-end"><SubmitButton className="shadow-lg">Save access</SubmitButton></div>}
      </ActionForm>
    </>
  );
}
