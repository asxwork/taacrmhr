import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { assignableUsers } from "@/lib/crm";
import { FormPage } from "@/components/ui";
import { CompanyForm, ContactForm } from "../forms";

export const metadata = { title: "New contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("crm.contacts");
  if (!can(user, "crm.contacts", "create")) redirect("/crm/contacts");
  const company = (await searchParams).tab === "companies";
  const back = company ? "/crm/contacts?tab=companies" : "/crm/contacts";
  const owners = await assignableUsers(user, "crm.contacts");
  if (company) {
    return (
      <FormPage title="New company" backHref={back} backLabel="Companies">
        <CompanyForm owners={owners} currentUserId={user.id} cancelHref={back} />
      </FormPage>
    );
  }
  const scope = (await scopeWhere(user, "crm.contacts"))!;
  const [companies, sources] = await Promise.all([
    db.company.findMany({ where: scope, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    db.leadSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <FormPage title="New contact" backHref={back} backLabel="Contacts">
      <ContactForm companies={companies} sources={sources} owners={owners} currentUserId={user.id} cancelHref={back} />
    </FormPage>
  );
}
