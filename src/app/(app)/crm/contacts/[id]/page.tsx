import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { TIMELINE_INCLUDE, assignableUsers, editableActivityIds, fmtPKR } from "@/lib/crm";
import { fmtDate } from "@/lib/utils";
import { Avatar, Button, Card, Drawer, LinkButton } from "@/components/ui";
import { InfoList, StatusPill } from "@/components/crm/bits";
import { Composer } from "@/components/crm/composer";
import { Timeline } from "@/components/crm/timeline";
import { ContactForm } from "../forms";
import { deleteContact } from "../actions";

export const metadata = { title: "Contact" };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("crm.contacts");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = (await scopeWhere(user, "crm.contacts"))!;
  const contact = await db.contact.findFirst({ where: { id, ...scope }, include: { company: true, owner: true, branch: true, source: true } });
  if (!contact) notFound();

  const path = `/crm/contacts/${id}`;
  const canEdit = can(user, "crm.contacts", "edit") && (await scopeMatcher(user, "crm.contacts", "edit"))(contact);
  const canDelete = can(user, "crm.contacts", "delete") && (await scopeMatcher(user, "crm.contacts", "delete"))(contact);

  // Linked records are still filtered by the user's own lead/deal scope.
  const [leadScope, dealScope] = await Promise.all([scopeWhere(user, "crm.leads"), scopeWhere(user, "crm.deals")]);
  const [leads, deals, actOwners] = await Promise.all([
    leadScope ? db.lead.findMany({ where: { contactId: id, ...leadScope }, include: { status: true }, orderBy: { createdAt: "desc" } }) : [],
    dealScope ? db.deal.findMany({ where: { contactId: id, ...dealScope }, include: { stage: true }, orderBy: { createdAt: "desc" } }) : [],
    assignableUsers(user, "crm.activities"),
  ]);
  const activities = await db.activity.findMany({
    where: { OR: [{ contactId: id }, { dealId: { in: deals.map((d) => d.id) } }, { leadId: { in: leads.map((l) => l.id) } }] },
    include: { ...TIMELINE_INCLUDE, deal: { select: { id: true, title: true } }, lead: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const items = activities.map((a) => ({
    ...a,
    context: a.deal ? { label: a.deal.title, href: `/crm/deals/${a.deal.id}` } : a.lead ? { label: "lead", href: `/crm/leads/${a.lead.id}` } : null,
  }));
  const editableIds = await editableActivityIds(user, activities.map((a) => a.id));

  const editData = sp.edit && canEdit
    ? await Promise.all([
        db.company.findMany({ where: scope, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
        db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
        assignableUsers(user, "crm.contacts"),
      ])
    : null;
  const wa = contact.phoneKey?.replace(/^0/, "92");

  return (
    <>
      <Link href="/crm/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Contacts
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={contact.name} className="size-12 text-base" />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{contact.name}</h1>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-sm hover:bg-canvas">
                  <Phone className="size-3.5" /> {contact.phone}
                </a>
              )}
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-emerald-700 hover:bg-emerald-50">
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-sm hover:bg-canvas">
                  <Mail className="size-3.5" /> {contact.email}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}>
              <Pencil className="size-4" /> Edit
            </LinkButton>
          )}
          {can(user, "crm.deals", "create") && (
            <LinkButton href={`/crm/deals?new=1&contact=${id}`}>
              <Plus className="size-4" /> New deal
            </LinkButton>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <InfoList
              rows={[
                ["Company", contact.company ? <Link key="c" href={`/crm/companies/${contact.company.id}`} className="hover:underline">{contact.company.name}</Link> : null],
                ["Responsible", contact.owner?.name],
                ["Branch", contact.branch?.name],
                ["Source", contact.source?.name],
                ["Second phone", contact.phone2],
                ["CNIC", contact.cnic],
                ["Address", contact.address],
                ["Since", fmtDate(contact.createdAt)],
              ]}
            />
            {contact.notes && <p className="mt-3 whitespace-pre-line rounded-md bg-canvas p-3 text-sm">{contact.notes}</p>}
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Deals ({deals.length})</h2>
            {deals.length === 0 ? (
              <p className="text-sm text-muted">No deals yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {deals.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/crm/deals/${d.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{d.title}</Link>
                    <span className="text-xs text-muted">{fmtPKR(d.value, { prefix: false })}</span>
                    <StatusPill name={d.stage.name} colorName={d.stage.color} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {leads.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-medium">Leads ({leads.length})</h2>
              <ul className="space-y-2.5">
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/crm/leads/${l.id}`} className="font-medium hover:underline">{fmtDate(l.createdAt)}</Link>
                    <StatusPill name={l.status.name} colorName={l.status.color} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {canDelete && (
            <form action={deleteContact}>
              <input type="hidden" name="id" value={id} />
              <Button variant="ghost" className="text-muted hover:text-red-600"><Trash2 className="size-4" /> Delete contact</Button>
            </form>
          )}
        </div>
        <div className="space-y-6">
          {can(user, "crm.activities", "create") && <Composer entity={{ contactId: id }} emailTo={contact.email} path={path} users={actOwners} currentUserId={user.id} />}
          <Timeline items={items} path={path} editableIds={editableIds} />
        </div>
      </div>

      {editData && (
        <Drawer title="Edit contact" closeHref={path}>
          <ContactForm contact={contact} companies={editData[0]} sources={editData[1]} owners={editData[2]} currentUserId={user.id} cancelHref={path} />
        </Drawer>
      )}
    </>
  );
}
