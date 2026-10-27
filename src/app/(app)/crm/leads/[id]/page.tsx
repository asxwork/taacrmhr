import Link from "next/link";
import { fmtPhone, telHref } from "@/lib/crm-shared";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Mail, MessageCircle, Pencil, Phone, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { TIMELINE_INCLUDE, assignableUsers, editableActivityIds, fmtPKR, INTERESTS } from "@/lib/crm";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { matchUnitsForLead, sizeLabel, unitLabel, unitOptions } from "@/lib/inventory";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton } from "@/components/ui";
import { CHEVRON_LAST, StageBar, hrefWith } from "@/components/crm/bits";
import { Composer } from "@/components/crm/composer";
import { Timeline } from "@/components/crm/timeline";
import { LeadForm } from "../lead-form";
import { convertLead, deleteLead, setLeadStatus } from "../actions";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; convert?: string; tab?: string }> }) {
  const user = await requirePermission("crm.leads");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = (await scopeWhere(user, "crm.leads"))!;
  const lead = await db.lead.findFirst({
    where: { id, ...scope },
    include: { status: true, source: true, project: true, unit: { include: { project: { select: { name: true } }, block: { select: { name: true } } } }, owner: true, createdBy: true, branch: true, contact: true, deals: { include: { stage: true } } },
  });
  if (!lead) notFound();

  const path = `/crm/leads/${id}`;
  const canEdit = can(user, "crm.leads", "edit") && (await scopeMatcher(user, "crm.leads", "edit"))(lead);
  const canDelete = can(user, "crm.leads", "delete") && (await scopeMatcher(user, "crm.leads", "delete"))(lead);
  const canConvert = canEdit && !lead.convertedAt && can(user, "crm.deals", "create");
  const tab = sp.tab === "units" || sp.tab === "deals" ? sp.tab : "general";
  const editing = !!sp.edit && canEdit;

  const [statuses, activities, sources, projects, owners, actOwners, pipelines] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true, kind: "open" }, orderBy: { sortOrder: "asc" } }),
    db.activity.findMany({ where: { leadId: id }, include: TIMELINE_INCLUDE, orderBy: { createdAt: "desc" } }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    assignableUsers(user, "crm.leads"),
    assignableUsers(user, "crm.activities"),
    db.pipeline.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const [editableIds, matches] = await Promise.all([
    editableActivityIds(user, activities.map((a) => a.id)),
    lead.convertedAt || lead.status.kind === "junk" ? [] : matchUnitsForLead(user, lead),
  ]);
  const phoneList = list(lead.phones, [lead.phone, lead.phone2], "Mobile");
  const emailList = list(lead.emails, [lead.email], "Work");
  const closedStages = await db.leadStatus.findMany({ where: { kind: "junk", active: true }, orderBy: { sortOrder: "asc" } });
  const waNumber = lead.phoneKey?.replace(/^0/, "92");
  const closed = !!lead.convertedAt || lead.status.kind === "converted";
  const isJunk = lead.status.kind === "junk";
  const budget = lead.budgetMin && lead.budgetMax && lead.budgetMin !== lead.budgetMax
    ? `${fmtPKR(lead.budgetMin)} – ${fmtPKR(lead.budgetMax, { prefix: false })}`
    : lead.budgetMax ?? lead.budgetMin ? fmtPKR(lead.budgetMax ?? lead.budgetMin) : null;

  const iconBtn = "flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-xs transition-colors hover:bg-canvas hover:text-ink";
  const tabLink = (t: string, label: string, count?: number) => (
    <Link href={hrefWith(path, {}, { tab: t === "general" ? undefined : t })} scroll={false}
      className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", tab === t ? "bg-navy-900/[0.07] font-medium text-navy-900 ring-1 ring-navy-900/15" : "text-muted hover:bg-canvas hover:text-ink")}>
      {label}{count ? <span className="ml-1.5 text-xs text-muted">{count}</span> : null}
    </Link>
  );

  return (
    <>
      <Link href="/crm/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      {/* Title + quick actions */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{lead.name}</h1>
        {lead.number && <span className="rounded-md bg-black/5 px-2 py-0.5 text-xs font-medium tabular-nums text-muted">#{lead.number}</span>}
        {canEdit && !editing && (
          <Link href={`${path}?edit=1`} scroll={false} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink" title="Edit lead" aria-label="Edit lead"><Pencil className="size-4" /></Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          {lead.phone && <a href={telHref(lead.phone)} className={iconBtn} title={`Call ${fmtPhone(lead.phone)}`} aria-label="Call"><Phone className="size-4" /></a>}
          {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className={cn(iconBtn, "hover:text-emerald-600")} title="WhatsApp" aria-label="WhatsApp"><MessageCircle className="size-4" /></a>}
          {lead.email && <a href={`mailto:${lead.email}`} className={iconBtn} title={lead.email} aria-label="Email"><Mail className="size-4" /></a>}
          {canConvert && (
            <LinkButton href={`${path}?convert=1`} scroll={false}><ArrowRightLeft className="size-4" /> Convert to deal</LinkButton>
          )}
        </div>
      </div>

      {/* Stage bar: open stages, then Complete lead (convert) and the closed stages */}
      <div className="mb-5">
        {closed ? (
          <div className="flex items-center gap-3 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white">
            Converted {lead.convertedAt ? `on ${fmtDate(lead.convertedAt)}` : ""}
            {lead.deals[0] && <Link href={`/crm/deals/${lead.deals[0].id}`} className="ml-auto underline">Open deal</Link>}
          </div>
        ) : (
          <StageBar
            size="lg"
            steps={statuses.map((s) => ({ ...s, locked: s.systemKey === "onhold" }))}
            currentId={isJunk ? "" : lead.statusId}
            action={setLeadStatus}
            hidden={{ leadId: id }}
            disabled={!canEdit}
            after={
              <>
                {canConvert ? (
                  <Link href={`${path}?convert=1`} scroll={false} className={cn("flex min-w-32 shrink-0 items-center px-5 py-2.5 text-[13px] font-medium transition", CHEVRON_LAST, "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100", closedStages.length > 0 && "rounded-r-none [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%,8px_50%)]")}>
                    Complete lead
                  </Link>
                ) : null}
                {/* Closed-without-deal stages (Not Interested, Not Valid…) */}
                {closedStages.map((s, i) => {
                  const on = lead.statusId === s.id;
                  const last = i === closedStages.length - 1;
                  return (
                    <button key={s.id} name="stepId" value={s.id} disabled={!canEdit || on}
                      className={cn(
                        "flex min-w-28 shrink-0 items-center px-5 py-2.5 text-[13px] font-medium transition disabled:cursor-default",
                        last ? CHEVRON_LAST : "-ml-1 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%,8px_50%)]",
                        on ? "bg-red-500 text-white" : "bg-black/5 text-muted enabled:hover:bg-red-50 enabled:hover:text-red-600",
                      )}>
                      {s.name}
                    </button>
                  );
                })}
              </>
            }
          />
        )}
        {isJunk && canEdit && <p className="mt-2 text-sm text-red-700">Closed as “{lead.status.name}”. Click a stage above to reopen it.</p>}
      </div>

      <nav className="mb-5 flex flex-wrap gap-1">
        {tabLink("general", "General")}
        {tabLink("units", "Matching units", matches.length)}
        {tabLink("deals", "Deals & contact", lead.deals.length + (lead.contact ? 1 : 0))}
      </nav>

      {tab === "general" && (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,380px)_1fr]">
          <Card className="p-5 xl:sticky xl:top-6">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider">Lead information</h2>
              {canEdit && (editing
                ? <Link href={path} scroll={false} className="text-sm text-muted hover:text-ink">cancel</Link>
                : <Link href={`${path}?edit=1`} scroll={false} className="text-sm text-muted hover:text-ink">edit</Link>)}
            </div>
            {editing ? (
              <LeadForm lead={lead} sources={sources} projects={projects} units={editing ? await unitOptions(user) : []} owners={owners} currentUserId={user.id} cancelHref={path} />
            ) : (
              <dl className="space-y-3.5">
                <Row label="Stage">{lead.status.name}</Row>
                <Row label="Client name">{lead.name}</Row>
                <Row label="Phone">{phoneList.length > 0 && <ContactValues items={phoneList.map((p) => ({ ...p, href: telHref(p.value), text: fmtPhone(p.value) }))} />}</Row>
                <Row label="E-mail">{emailList.length > 0 && <ContactValues items={emailList.map((e) => ({ ...e, href: `mailto:${e.value}`, text: e.value }))} />}</Row>
                <Row label="Source">{lead.source?.name}</Row>
                <Row label="Source information">{lead.sourceInfo}</Row>
                {lead.campaign && <Row label="Campaign">{lead.campaign}</Row>}
                <Row label="Property">{lead.unit && <Link href={`/inventory/units/${lead.unit.id}`} className="text-navy-900 hover:underline">{unitLabel(lead.unit)}</Link>}</Row>
                <Row label="Project">{lead.project && <Link href={`/inventory/projects/${lead.project.id}`} className="text-navy-900 hover:underline">{lead.project.name}</Link>}</Row>
                <Row label="Interest">{[INTERESTS.find((i) => i.value === lead.interest)?.label, lead.propertyType].filter(Boolean).join(" · ")}</Row>
                <Row label="Preferred location">{lead.location}</Row>
                <Row label="Budget">{budget}</Row>
                <Row label="Responsible">{lead.owner?.name}</Row>
                <Row label="Branch">{lead.branch?.name}</Row>
                <Row label="Created">{`${fmtDateTime(lead.createdAt)}${lead.createdBy ? ` by ${lead.createdBy.name}` : ""}`}</Row>
                <Row label="Modified">{fmtDateTime(lead.updatedAt)}</Row>
                {lead.notes && <Row label="Notes"><span className="whitespace-pre-line">{lead.notes}</span></Row>}
              </dl>
            )}
            {canDelete && !editing && (
              <form action={deleteLead} className="mt-5 border-t border-line pt-3">
                <input type="hidden" name="id" value={id} />
                <button className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-red-600"><Trash2 className="size-4" /> Delete lead</button>
              </form>
            )}
          </Card>

          <div className="min-w-0 space-y-2">
            {can(user, "crm.activities", "create") && <Composer entity={{ leadId: id }} emailTo={lead.email} path={path} users={actOwners} currentUserId={user.id} />}
            <Timeline items={activities} path={path} editableIds={editableIds} canDelete={user.isSuperAdmin} canPlan={can(user, "crm.activities", "create")} />
          </div>
        </div>
      )}

      {tab === "units" && (
        <Card className="overflow-hidden">
          {matches.length === 0 ? <EmptyState title="No matching units" description="Add a project, property type, location or budget to find available units for this client." /> : (
            <ul className="divide-y divide-line">
              {matches.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Link href={`/inventory/units/${u.id}`} className="size-12 shrink-0 overflow-hidden rounded-md bg-canvas" aria-hidden tabIndex={-1}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user upload served from /api/files */}
                    {u.images[0] && <img src={fileUrl(u.images[0].path)} alt="" className="size-full object-cover" loading="lazy" />}
                  </Link>
                  <span className="flex-1">
                    <Link href={`/inventory/units/${u.id}`} className="font-medium hover:underline">{unitLabel(u)}</Link>
                    <span className="block text-xs text-muted">{u.type} · {sizeLabel(u.size, u.sizeUnit)}</span>
                  </span>
                  <span className="font-medium tabular-nums">{fmtPKR(u.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "deals" && (
        <Card className="overflow-hidden">
          {!lead.contact && lead.deals.length === 0 ? <EmptyState title="Not converted yet" description="Use Complete lead (Convert to deal) to create a deal and a contact." /> : (
            <ul className="divide-y divide-line text-sm">
              {lead.contact && (
                <li className="flex items-center gap-3 px-5 py-3">
                  <span className="flex-1 text-muted">Contact</span>
                  <Link href={`/crm/contacts/${lead.contact.id}`} className="font-medium hover:underline">{lead.contact.name}</Link>
                </li>
              )}
              {lead.deals.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <Link href={`/crm/deals/${d.id}`} className="flex-1 font-medium hover:underline">{d.title}</Link>
                  <Badge>{d.stage.name}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {sp.convert && canConvert && (
        <Drawer title="Convert to deal" closeHref={path}>
          <p className="mb-4 text-sm text-muted">
            Creates a deal and a contact for {lead.name} (or links the existing contact with the same phone). The lead is marked converted and its history carries over.
          </p>
          <ActionForm action={convertLead} className="space-y-4">
            <input type="hidden" name="leadId" value={id} />
            <Field label="Deal title">
              <input name="title" defaultValue={[lead.project?.name ?? lead.propertyType, lead.location].filter(Boolean).join(" — ") || lead.name} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pipeline">
                <select name="pipelineId" defaultValue={pipelines.find((p) => p.isDefault)?.id} className="input">
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Deal value" hint="Empty = unit price or budget">
                <input name="value" placeholder={lead.budgetMax ?? lead.budgetMin ? String(lead.budgetMax ?? lead.budgetMin) : "e.g. 2.5 cr"} className="input" />
              </Field>
            </div>
            <Field label="Property" hint="Linked to the deal; it is held, booked and sold as the deal moves through its stages.">
              <select name="unitId" defaultValue={lead.unit && !lead.unit.activeDealId ? lead.unit.id : ""} className="input">
                <option value="">No unit yet</option>
                {lead.unit && !lead.unit.activeDealId && <option value={lead.unit.id}>{unitLabel(lead.unit)}{lead.unit.price ? ` · ${fmtPKR(lead.unit.price)}` : ""} (enquired about)</option>}
                {matches.filter((u) => u.id !== lead.unitId && !u.activeDealId).slice(0, 25).map((u) => (
                  <option key={u.id} value={u.id}>{unitLabel(u)} · {u.type}{u.price ? ` · ${fmtPKR(u.price)}` : ""}</option>
                ))}
              </select>
            </Field>
            <SubmitButton pendingText="Converting…">Create deal</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-sm", empty && "text-muted/60")}>{empty ? "field is empty" : children}</dd>
    </div>
  );
}

/** Saved [{type, value}] list, or the older single fields. */
function list(json: string | null, fallback: (string | null)[], type: string): { type: string; value: string }[] {
  if (json) {
    try {
      const v = JSON.parse(json) as { type: string; value: string }[];
      if (Array.isArray(v) && v.length) return v;
    } catch {}
  }
  return fallback.filter((x): x is string => !!x).map((value) => ({ type, value }));
}

function ContactValues({ items }: { items: { type: string; href: string; text: string }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.href} className="flex items-baseline justify-between gap-3">
          <a href={i.href} className="text-navy-900 underline decoration-dotted underline-offset-4">{i.text}</a>
          <span className="shrink-0 text-xs text-muted">{i.type}</span>
        </li>
      ))}
    </ul>
  );
}
