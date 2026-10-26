import Link from "next/link";
import { fmtPhone } from "@/lib/crm-shared";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { TIMELINE_INCLUDE, assignableUsers, editableActivityIds, fmtPKR } from "@/lib/crm";
import { Button, Card, Drawer, LinkButton } from "@/components/ui";
import { InfoList, StatusPill } from "@/components/crm/bits";
import { Composer } from "@/components/crm/composer";
import { Timeline } from "@/components/crm/timeline";
import { CompanyForm } from "../../contacts/forms";
import { deleteCompany } from "../../contacts/actions";

export const metadata = { title: "Company" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("crm.contacts");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = (await scopeWhere(user, "crm.contacts"))!;
  const company = await db.company.findFirst({ where: { id, ...scope }, include: { owner: true } });
  if (!company) notFound();

  const path = `/crm/companies/${id}`;
  const canEdit = can(user, "crm.contacts", "edit") && (await scopeMatcher(user, "crm.contacts", "edit"))(company);
  const canDelete = can(user, "crm.contacts", "delete") && (await scopeMatcher(user, "crm.contacts", "delete"))(company);
  const dealScope = await scopeWhere(user, "crm.deals");

  const [contacts, deals, activities, actOwners, owners] = await Promise.all([
    db.contact.findMany({ where: { companyId: id, ...scope }, orderBy: { name: "asc" } }),
    dealScope ? db.deal.findMany({ where: { companyId: id, ...dealScope }, include: { stage: true } }) : [],
    db.activity.findMany({ where: { companyId: id }, include: TIMELINE_INCLUDE, orderBy: { createdAt: "desc" } }),
    assignableUsers(user, "crm.activities"),
    assignableUsers(user, "crm.contacts"),
  ]);
  const editableIds = await editableActivityIds(user, activities.map((a) => a.id));

  return (
    <>
      <Link href="/crm/contacts?tab=companies" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Companies
      </Link>
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{company.name}</h1>
        {canEdit && (
          <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}>
            <Pencil className="size-4" /> Edit
          </LinkButton>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <InfoList rows={[["Phone", company.phone], ["Email", company.email], ["Industry", company.industry], ["Address", company.address], ["Responsible", company.owner?.name]]} />
            {company.notes && <p className="mt-3 whitespace-pre-line rounded-md bg-canvas p-3 text-sm">{company.notes}</p>}
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Contacts ({contacts.length})</h2>
            <ul className="space-y-2 text-sm">
              {contacts.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <Link href={`/crm/contacts/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  <span className="text-muted">{fmtPhone(c.phone)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {deals.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-medium">Deals ({deals.length})</h2>
              <ul className="space-y-2.5">
                {deals.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/crm/deals/${d.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{d.title}</Link>
                    <span className="text-xs text-muted">{fmtPKR(d.value, { prefix: false })}</span>
                    <StatusPill name={d.stage.name} colorName={d.stage.color} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {canDelete && (
            <form action={deleteCompany}>
              <input type="hidden" name="id" value={id} />
              <Button variant="ghost" className="text-muted hover:text-red-600"><Trash2 className="size-4" /> Delete company</Button>
            </form>
          )}
        </div>
        <div className="space-y-6">
          {can(user, "crm.activities", "create") && <Composer entity={{ companyId: id }} emailTo={company.email} path={path} users={actOwners} currentUserId={user.id} />}
          <Timeline items={activities} path={path} editableIds={editableIds} />
        </div>
      </div>
      {sp.edit && canEdit && (
        <Drawer title="Edit company" closeHref={path}>
          <CompanyForm company={company} owners={owners} currentUserId={user.id} cancelHref={path} />
        </Drawer>
      )}
    </>
  );
}
