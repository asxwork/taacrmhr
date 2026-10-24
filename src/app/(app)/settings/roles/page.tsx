import Link from "next/link";
import { ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, Field, LinkButton, PageHeader } from "@/components/ui";
import { createRole } from "./actions";

export const metadata = { title: "Roles & Permissions" };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const actor = await requirePermission("settings.roles");
  const sp = await searchParams;
  const [roles, superAdmins] = await Promise.all([
    db.role.findMany({ include: { _count: { select: { users: true, permissions: true } } }, orderBy: { name: "asc" } }),
    db.user.count({ where: { isSuperAdmin: true, active: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="A role is a set of permissions. Assign one or more roles to each user."
        actions={
          can(actor, "settings.roles", "create") && (
            <LinkButton href="/settings/roles?new" scroll={false}>
              <Plus className="size-4" /> New role
            </LinkButton>
          )
        }
      />

      <div className="space-y-2">
        <Card className="flex items-center gap-4 p-4">
          <ShieldCheck className="size-5 text-gold-600" />
          <div className="flex-1">
            <p className="font-medium">Super Admin</p>
            <p className="text-sm text-muted">Full access to everything. Not a role — granted per user in Users.</p>
          </div>
          <Badge tone="gold">{superAdmins} user{superAdmins === 1 ? "" : "s"}</Badge>
        </Card>
        {roles.map((r) => (
          <Link key={r.id} href={`/settings/roles/${r.id}`}>
            <Card className="group flex items-center gap-4 p-4 transition hover:border-navy-900/20">
              <div className="flex-1">
                <p className="font-medium">{r.name}</p>
                {r.description && <p className="text-sm text-muted">{r.description}</p>}
              </div>
              <Badge>{r._count.permissions} grants</Badge>
              <Badge tone="navy">{r._count.users} user{r._count.users === 1 ? "" : "s"}</Badge>
              <ChevronRight className="size-4 text-muted group-hover:text-ink" />
            </Card>
          </Link>
        ))}
      </div>

      {sp.new !== undefined && can(actor, "settings.roles", "create") && (
        <Drawer title="New role" closeHref="/settings/roles">
          <ActionForm action={createRole} className="space-y-4">
            <Field label="Role name">
              <input name="name" required className="input" placeholder="e.g. Team Lead" />
            </Field>
            <Field label="Description">
              <input name="description" className="input" />
            </Field>
            <Field label="Start from" hint="Copy permissions from an existing role, then adjust.">
              <select name="copyFrom" className="input">
                <option value="">Blank (no access)</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
            <SubmitButton>Create &amp; edit permissions</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
