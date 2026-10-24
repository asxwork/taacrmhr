import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { saveBranch, saveCompany, saveCompanyAppearance } from "./actions";
import { AppearanceForm } from "@/components/appearance-form";
import { getCompanyAppearance } from "@/lib/appearance-server";

export const metadata = { title: "Company & Branches" };

export default async function CompanyPage() {
  const actor = await requirePermission("settings.company");
  const editable = can(actor, "settings.company", "edit");
  const [companyName, branches] = await Promise.all([
    db.setting.findUnique({ where: { key: "company.name" } }),
    db.branch.findMany({ include: { _count: { select: { users: true } } }, orderBy: { name: "asc" } }),
]);

  return (
    <>
      <PageHeader title="Company & Branches" description="Company details and branches. CRM lists live in CRM Settings." />

      <fieldset disabled={!editable} className="space-y-8">
        <Section title="Company">
          <Card className="p-5">
            <ActionForm action={saveCompany} className="flex flex-wrap items-end gap-3" successMessage="Saved.">
              <Field label="Company name" className="min-w-64 flex-1">
                <input name="name" defaultValue={companyName?.value} required className="input" />
              </Field>
              <Field label="Currency" className="w-28">
                <input value="PKR" disabled className="input" readOnly />
              </Field>
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <Section title="Branches" hint="Users, leads, deals and units belong to a branch. “Branch” permission scope uses this.">
          <Card className="divide-y divide-line">
            {branches.map((b) => (
              <ActionForm key={b.id} action={saveBranch} className="flex flex-wrap items-center gap-2 p-3">
                <input type="hidden" name="id" value={b.id} />
                <input name="name" defaultValue={b.name} required className="input w-44" aria-label="Branch name" />
                <input name="code" defaultValue={b.code} required className="input w-20 uppercase" aria-label="Code" />
                <input name="address" defaultValue={b.address ?? ""} placeholder="Address" className="input min-w-48 flex-1" aria-label="Address" />
                <label className="flex items-center gap-1.5 px-2 text-sm text-muted">
                  <input type="checkbox" name="active" defaultChecked={b.active} className="accent-navy-900" /> Active
                </label>
                <Badge>{b._count.users} users</Badge>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={saveBranch} className="flex flex-wrap items-center gap-2 bg-canvas/50 p-3">
              <input name="name" required placeholder="New branch name" className="input w-44" />
              <input name="code" required placeholder="Code" className="input w-20 uppercase" />
              <input name="address" placeholder="Address" className="input min-w-48 flex-1" />
              <SubmitButton>Add branch</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <Section title="Default appearance" hint="Applies to everyone who hasn’t picked their own theme, colour or wallpaper in My Profile.">
          <Card className="p-5">
            <AppearanceForm action={saveCompanyAppearance} values={await getCompanyAppearance()} />
          </Card>
        </Section>
      </fieldset>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-medium">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
