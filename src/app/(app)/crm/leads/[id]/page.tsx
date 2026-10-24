import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Mail, MessageCircle, Pencil, Phone, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { TIMELINE_INCLUDE, assignableUsers, editableActivityIds, fmtPKR, INTERESTS } from "@/lib/crm";
import { fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, Field, LinkButton } from "@/components/ui";
import { InfoList, StageBar, StatusPill } from "@/components/crm/bits";
import { Composer } from "@/components/crm/composer";
import { Timeline } from "@/components/crm/timeline";
import { LeadForm } from "../lead-form";
import { convertLead, deleteLead, setLeadStatus } from "../actions";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; convert?: string }> }) {
  const user = await requirePermission("crm.leads");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = (await scopeWhere(user, "crm.leads"))!;
  const lead = await db.lead.findFirst({
    where: { id, ...scope },
    include: { status: true, source: true, owner: true, createdBy: true, branch: true, contact: true, deals: { include: { stage: true } } },
  });
  if (!lead) notFound();

  const path = `/crm/leads/${id}`;
  const canEdit = can(user, "crm.leads", "edit") && (await scopeMatcher(user, "crm.leads", "edit"))(lead);
  const canDelete = can(user, "crm.leads", "delete") && (await scopeMatcher(user, "crm.leads", "delete"))(lead);
  const canConvert = canEdit && !lead.convertedAt && can(user, "crm.deals", "create");

  const [statuses, activities, sources, owners, actOwners, pipelines] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true, kind: "open" }, orderBy: { sortOrder: "asc" } }),
    db.activity.findMany({ where: { leadId: id }, include: TIMELINE_INCLUDE, orderBy: { createdAt: "desc" } }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    assignableUsers(user, "crm.leads"),
    assignableUsers(user, "crm.activities"),
    db.pipeline.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const editableIds = await editableActivityIds(user, activities.map((a) => a.id));
  const junk = await db.leadStatus.findFirst({ where: { kind: "junk", active: true } });
  const waNumber = lead.phoneKey?.replace(/^0/, "92");

  return (
    <>
      <Link href="/crm/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1>
            <StatusPill name={lead.status.name} colorName={lead.status.color} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-sm hover:bg-canvas">
                <Phone className="size-3.5" /> {lead.phone}
              </a>
            )}
            {waNumber && (
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-sm text-emerald-700 hover:bg-emerald-50">
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-sm hover:bg-canvas">
                <Mail className="size-3.5" /> {lead.email}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}>
              <Pencil className="size-4" /> Edit
            </LinkButton>
          )}
          {canConvert && (
            <LinkButton href={`${path}?convert=1`} scroll={false}>
              <ArrowRightLeft className="size-4" /> Convert to deal
            </LinkButton>
          )}
        </div>
      </div>

      {!lead.convertedAt && lead.status.kind !== "junk" && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <StageBar steps={statuses} currentId={lead.statusId} action={setLeadStatus} hidden={{ leadId: id }} disabled={!canEdit} />
          </div>
          {canEdit && junk && (
            <form action={setLeadStatus}>
              <input type="hidden" name="leadId" value={id} />
              <button name="stepId" value={junk.id} className="h-8 rounded-md px-3 text-xs text-muted hover:bg-red-50 hover:text-red-600">Mark junk</button>
            </form>
          )}
        </div>
      )}
      {lead.status.kind === "junk" && canEdit && (
        <form action={setLeadStatus} className="mb-6 flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <input type="hidden" name="leadId" value={id} />
          This lead is marked as junk.
          <button name="stepId" value={statuses[0]?.id} className="font-medium underline">Reopen</button>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Requirement</h2>
            <InfoList
              rows={[
                ["Interest", INTERESTS.find((i) => i.value === lead.interest)?.label],
                ["Property type", lead.propertyType],
                ["Location", lead.location],
                ["Budget", lead.budgetMin && lead.budgetMax && lead.budgetMin !== lead.budgetMax ? `${fmtPKR(lead.budgetMin)} – ${fmtPKR(lead.budgetMax, { prefix: false })}` : fmtPKR(lead.budgetMax ?? lead.budgetMin)],
              ]}
            />
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Details</h2>
            <InfoList
              rows={[
                ["Responsible", lead.owner?.name],
                ["Branch", lead.branch?.name],
                ["Source", lead.source?.name],
                ["Campaign", lead.campaign],
                ["Second phone", lead.phone2],
                ["Created", `${fmtDate(lead.createdAt)}${lead.createdBy ? ` by ${lead.createdBy.name}` : ""}`],
              ]}
            />
            {lead.notes && <p className="mt-3 whitespace-pre-line rounded-md bg-canvas p-3 text-sm">{lead.notes}</p>}
          </Card>
          {(lead.contact || lead.deals.length > 0) && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-medium">Linked</h2>
              <ul className="space-y-2 text-sm">
                {lead.contact && (
                  <li>
                    Contact: <Link href={`/crm/contacts/${lead.contact.id}`} className="font-medium hover:underline">{lead.contact.name}</Link>
                  </li>
                )}
                {lead.deals.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <Link href={`/crm/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                    <Badge>{d.stage.name}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {canDelete && (
            <form action={deleteLead}>
              <input type="hidden" name="id" value={id} />
              <Button variant="ghost" className="text-muted hover:text-red-600">
                <Trash2 className="size-4" /> Delete lead
              </Button>
            </form>
          )}
        </div>

        <div className="space-y-6">
          {can(user, "crm.activities", "create") && <Composer entity={{ leadId: id }} path={path} users={actOwners} currentUserId={user.id} />}
          <Timeline items={activities} path={path} editableIds={editableIds} />
        </div>
      </div>

      {sp.edit && canEdit && (
        <Drawer title="Edit lead" closeHref={path}>
          <LeadForm lead={lead} sources={sources} owners={owners} currentUserId={user.id} cancelHref={path} />
        </Drawer>
      )}

      {sp.convert && canConvert && (
        <Drawer title="Convert to deal" closeHref={path}>
          <p className="mb-4 text-sm text-muted">
            Creates a deal and a contact for {lead.name} (or links the existing contact with the same phone). The lead is marked converted and its history carries over.
          </p>
          <ActionForm action={convertLead} className="space-y-4">
            <input type="hidden" name="leadId" value={id} />
            <Field label="Deal title">
              <input name="title" defaultValue={[lead.propertyType, lead.location].filter(Boolean).join(" — ") || lead.name} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pipeline">
                <select name="pipelineId" defaultValue={pipelines.find((p) => p.isDefault)?.id} className="input">
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Deal value" hint="e.g. 2.5 cr">
                <input name="value" defaultValue={lead.budgetMax ?? lead.budgetMin ?? ""} className="input" />
              </Field>
            </div>
            <SubmitButton pendingText="Converting…">Create deal</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
