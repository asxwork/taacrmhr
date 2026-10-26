import Link from "next/link";
import { fmtPhone, telHref } from "@/lib/crm-shared";
import { redirect } from "next/navigation";
import { addDays, format, isPast, startOfDay } from "date-fns";
import { CalendarDays, Download, KanbanSquare, List, ListTodo, Phone, Plus, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { assignableUsers, color, usersInScope } from "@/lib/crm";
import { LEAD_FILTER_KEYS, leadWhere, type LeadFilters } from "@/lib/lead-filters";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Card, Drawer, EmptyState, Field, LinkButton } from "@/components/ui";
import { Kanban } from "@/components/crm/kanban";
import { SelectAll } from "@/components/crm/select-all";
import { LeadFilterBar, type FilterPreset } from "@/components/crm/lead-filter-bar";
import { Pagination, StageProgress, hrefWith } from "@/components/crm/bits";
import { LeadBulkBar } from "@/components/crm/lead-bulk-bar";
import { describe, parseConfig } from "@/lib/automations";
import { bulkLeads, importLeads, importLeadsFull, moveLead } from "./actions";

export const metadata = { title: "Leads" };

const PAGE_SIZE = 50;
type SP = LeadFilters & { view?: string; page?: string; new?: string; import?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("crm.leads");
  const sp = await searchParams;
  if (sp.new) redirect("/crm/leads/new");
  const view = sp.view === "board" ? "board" : "list";
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = Object.fromEntries(LEAD_FILTER_KEYS.filter((k) => sp[k]).map((k) => [k, sp[k]])) as LeadFilters;
  const keep: Record<string, string | undefined> = { ...filters, view: sp.view };

  const [statuses, sources, projects, owners, assignees, canEditRow, saved] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    usersInScope(user, "crm.leads", "view"),
    assignableUsers(user, "crm.leads"),
    scopeMatcher(user, "crm.leads", "edit"),
    db.savedFilter.findMany({ where: { userId: user.id, module: "crm.leads" }, orderBy: { createdAt: "asc" } }),
  ]);
  const openStatuses = statuses.filter((s) => s.kind === "open");
  const where = await leadWhere(user, filters, statuses);

  // Activity counters over open leads in scope, fetched together with the page of leads.
  const scope = (await scopeWhere(user, "crm.leads"))!;
  const openWhere = { ...scope, statusId: { in: openStatuses.map((s) => s.id) } };
  const today = startOfDay(new Date());
  const [leads, total, overdue, dueToday, unplanned] = await Promise.all([
    db.lead.findMany({
      where,
      include: { status: true, source: true, project: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: view === "list" ? (page - 1) * PAGE_SIZE : 0,
      take: view === "list" ? PAGE_SIZE : 500,
    }),
    db.lead.count({ where }),
    db.lead.count({ where: { ...openWhere, activities: { some: { doneAt: null, dueAt: { lt: new Date() } } } } }),
    db.lead.count({ where: { ...openWhere, activities: { some: { doneAt: null, dueAt: { gte: today, lt: addDays(today, 1) } } } } }),
    db.lead.count({ where: { ...openWhere, activities: { none: { doneAt: null, dueAt: { not: null } } } } }),
  ]);

  // Next planned activity per lead (the Bitrix "Activity" column).
  const next = new Map<string, { subject: string; dueAt: Date; owner: string | null }>();
  for (const a of await db.activity.findMany({
    where: { leadId: { in: leads.map((l) => l.id) }, doneAt: null, dueAt: { not: null } },
    include: { owner: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
  })) if (a.leadId && !next.has(a.leadId)) next.set(a.leadId, { subject: a.subject, dueAt: a.dueAt!, owner: a.owner?.name ?? null });


  const presets: FilterPreset[] = [
    { name: "Leads in progress", query: "" },
    { name: "My leads", query: "owner=me" },
    { name: "Today's leads", query: "created=today&group=all" },
    { name: "Yesterday's leads", query: "created=yesterday&group=all" },
    { name: "Not contacted 7+ days", query: "stale=7" },
    { name: "Overdue activities", query: "activity=overdue" },
    { name: "Reshuffled", query: "reshuffled=1" },
    { name: "Completed (converted)", query: "group=converted" },
    { name: "Not interested / not valid", query: "group=junk" },
    ...saved.map((s) => ({ id: s.id, name: s.name, query: s.query })),
    ...sources.map((s) => ({ name: s.name, query: `source=${s.id}` })),
    ...projects.map((p) => ({ name: p.name, query: `project=${p.id}` })),
  ];

  // Active automations, described in plain words for the run confirmation.
  const automationOptions = (await db.automation.findMany({ where: { active: true, entity: "lead" }, orderBy: { name: "asc" } })).map((a) => {
    const c = parseConfig(a.config);
    return {
      id: a.id, name: a.name, assign: c.assign, userIds: c.userIds, deletes: c.deleteHistory || c.deleteOpen,
      steps: describe(c, { stage: statuses.find((st) => st.id === c.stageId)?.name, users: assignees.filter((u) => c.userIds.includes(u.id)).map((u) => u.name) }),
    };
  });
  const canCreate = can(user, "crm.leads", "create");
  const canEdit = can(user, "crm.leads", "edit");
  const canDelete = can(user, "crm.leads", "delete");
  const canAssign = assignees.length > 1;
  const closeHref = hrefWith("/crm/leads", keep, {});
  const counter = (label: string, n: number, activity: string, tone: string) => (
    <Link
      href={hrefWith("/crm/leads", { view: sp.view }, { activity: filters.activity === activity ? undefined : activity })}
      className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors", filters.activity === activity ? "bg-navy-900/[0.07] font-medium text-navy-900" : "text-muted hover:bg-canvas hover:text-ink")}
    >
      <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums", n ? tone : "bg-black/5 text-muted")}>{n > 99 ? "99+" : n}</span>
      {label}
    </Link>
  );
  const viewTab = (href: string, Icon: typeof List, label: string, on: boolean) => (
    <Link href={href} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", on ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
      <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
    </Link>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Leads</h1>
        {canCreate && (
          <div className="flex">
            <LinkButton href="/crm/leads/new" className="rounded-r-none" prefetch><Plus className="size-4" /> Create</LinkButton>
            <LinkButton href={hrefWith("/crm/leads", keep, { import: "1" })} scroll={false} className="rounded-l-none border-l border-white/15 px-2.5" title="Import from CSV" aria-label="Import from CSV"><Upload className="size-4" /></LinkButton>
          </div>
        )}
        <div className="order-last w-full sm:order-none sm:w-auto sm:min-w-80 sm:flex-1">
          <LeadFilterBar
            filters={filters}
            view={sp.view}
            presets={presets}
            options={{ stages: statuses.map((s) => ({ id: s.id, name: s.name })), sources, projects, owners }}
          />
        </div>
        {can(user, "crm.leads", "export") && (
          <details className="group relative ml-auto sm:ml-0">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm shadow-xs hover:bg-canvas [&::-webkit-details-marker]:hidden" title="Export">
              <Download className="size-4" /> <span className="hidden sm:inline">Export</span>
            </summary>
            <div className="anim-fade absolute right-0 top-12 z-30 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
              <a href={hrefWith("/api/export/leads-full", filters, {})} className="block rounded-lg px-3 py-2 hover:bg-canvas">
                <span className="block text-sm font-medium">Excel with activities</span>
                <span className="block text-xs text-muted">Every field and every call, note and task for the leads in this filter. Imports back.</span>
              </a>
              <a href={hrefWith("/api/export/leads-full", {}, { everything: "1" })} className="block rounded-lg px-3 py-2 hover:bg-canvas">
                <span className="block text-sm font-medium">Everything (full backup)</span>
                <span className="block text-xs text-muted">All leads you can see, any stage, with activities.</span>
              </a>
              <a href={hrefWith("/api/export/leads", filters, {})} className="block rounded-lg px-3 py-2 hover:bg-canvas">
                <span className="block text-sm font-medium">CSV (leads only)</span>
                <span className="block text-xs text-muted">Simple spreadsheet of this list.</span>
              </a>
            </div>
          </details>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-black/5 p-0.5">
          {viewTab(hrefWith("/crm/leads", { ...keep, page: undefined }, { view: "board" }), KanbanSquare, "Kanban", view === "board")}
          {viewTab(hrefWith("/crm/leads", { ...keep, page: undefined }, { view: undefined }), List, "List", view === "list")}
          {viewTab("/crm/tasks", ListTodo, "Activities", false)}
          {viewTab("/crm/tasks?view=calendar", CalendarDays, "Calendar", false)}
        </div>
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {counter("Overdue", overdue, "overdue", "bg-red-500 text-white")}
          {counter("Today", dueToday, "today", "bg-gold-600 text-white")}
          {counter("Nothing planned", unplanned, "none", "bg-navy-900 text-white")}
        </div>
      </div>

      {view === "board" ? (
        <Kanban
          columns={statuses.filter((s) => (filters.group === "all" || filters.stage ? true : filters.group ? s.kind === filters.group : s.kind === "open")).map((s) => ({ id: s.id, name: s.name, dot: color(s.color).dot }))}
          cards={leads.map((l) => ({
            id: l.id,
            columnId: l.statusId,
            title: l.name,
            href: `/crm/leads/${l.id}`,
            subtitle: [l.project?.name ?? l.propertyType, l.location].filter(Boolean).join(" · ") || fmtPhone(l.phone) || undefined,
            meta: [l.number && `#${l.number}`, l.source?.name].filter(Boolean).join(" · "),
            amount: l.budgetMax ?? l.budgetMin ?? undefined,
            owner: l.owner?.name,
            draggable: canEdit && canEditRow(l),
          }))}
          onMove={moveLead}
        />
      ) : (
        <Card className="overflow-hidden">
          {leads.length === 0 ? (
            <EmptyState
              title="No leads here"
              description={Object.keys(filters).length ? "Nothing matches this filter. Try another preset or reset the filter." : "Create your first lead or import a CSV."}
              action={canCreate && <LinkButton href="/crm/leads/new" prefetch>Create lead</LinkButton>}
            />
          ) : (
            <ActionForm action={bulkLeads}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-line bg-canvas/60">
                    <tr>
                      {canEdit && <th className="th w-10"><SelectAll /></th>}
                      <th className="th w-16">ID</th>
                      <th className="th">Lead</th>
                      <th className="th">Stage</th>
                      <th className="th">Phone</th>
                      <th className="th">Activity</th>
                      <th className="th">Created</th>
                      <th className="th">Responsible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {leads.map((l) => {
                      const act = next.get(l.id);
                      const late = act && isPast(act.dueAt);
                      return (
                        <tr key={l.id} className="align-top transition-colors hover:bg-canvas/60">
                          {canEdit && (
                            <td className="td">{canEditRow(l) && <input type="checkbox" name="ids" value={l.id} className="accent-navy-900" aria-label={`Select ${l.name}`} />}</td>
                          )}
                          <td className="td text-xs tabular-nums text-muted">{l.number ?? "—"}{l.reshuffledAt && <span title={`Reshuffled ${l.reshuffleCount}×`} className="mt-1 block w-fit rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700">Reshuffled</span>}</td>
                          <td className="td max-w-64">
                            <Link href={`/crm/leads/${l.id}`} className="font-medium text-navy-900 hover:underline">{l.name}</Link>
                            <p className="truncate text-xs text-muted">{[l.source?.name, l.project?.name].filter(Boolean).join(" · ") || "—"}</p>
                          </td>
                          <td className="td">
                            <StageProgress steps={openStatuses} currentId={l.statusId} name={l.status.name} colorName={l.status.color} kind={l.status.kind} />
                          </td>
                          <td className="td whitespace-nowrap">
                            {l.phone ? <a href={telHref(l.phone)} className="inline-flex items-center gap-1.5 hover:text-navy-900 hover:underline"><Phone className="size-3.5 text-muted" />{fmtPhone(l.phone)}</a> : <span className="text-muted">—</span>}
                          </td>
                          <td className="td min-w-44 max-w-60">
                            {act ? (
                              <>
                                <p className={cn("text-xs font-medium", late ? "text-red-600" : "text-ink/80")}>{format(act.dueAt, "d MMM yyyy, h:mm a")}</p>
                                <p className="truncate text-sm">{act.subject}</p>
                                {act.owner && <p className="text-xs text-muted">for <span className="text-navy-900">{act.owner}</span></p>}
                              </>
                            ) : (
                              <Link href={`/crm/leads/${l.id}#composer`} className="text-xs text-muted hover:text-navy-900 hover:underline">+ Plan activity</Link>
                            )}
                          </td>
                          <td className="td whitespace-nowrap text-sm text-muted">{format(l.createdAt, "d MMM yyyy")}</td>
                          <td className="td whitespace-nowrap">
                            {l.owner ? <span className="flex items-center gap-2 text-sm"><Avatar name={l.owner.name} className="size-7 text-[10px]" />{l.owner.name}</span> : <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canEdit && (
                <LeadBulkBar
                  assignees={assignees}
                  stages={statuses.filter((s) => s.kind !== "converted")}
                  automations={automationOptions}
                  canAssign={canAssign}
                  canDelete={canDelete}
                  isSuperAdmin={user.isSuperAdmin}
                />
              )}
              <Pagination base="/crm/leads" sp={keep} page={page} pageSize={PAGE_SIZE} total={total} />
            </ActionForm>
          )}
        </Card>
      )}

      {sp.import && canCreate && (
        <Drawer title="Import leads" closeHref={closeHref}>
          <ActionForm action={importLeads} className="space-y-4">
            <p className="text-sm text-muted">
              Upload a <b className="font-medium text-ink">CSV</b> (from Excel: <i>File → Save As → CSV</i>). First row = headers. Recognised columns:{" "}
              <span className="text-ink">name, phone, email, source, campaign, interest, property type, location, budget, notes</span>.
            </p>
            <Field label="CSV file">
              <input name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
            </Field>
            <Field label="Source (when the file has none)">
              <select name="sourceId" className="input" defaultValue="">
                <option value="">—</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {canAssign && (
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-xs font-medium text-ink/80">Assign to</legend>
                <select name="assign" className="input" defaultValue={user.id}>
                  {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  <option value="rr">Round-robin across selected people ↓</option>
                </select>
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-2.5">
                  {assignees.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="rr" value={u.id} className="accent-navy-900" /> {u.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="skipDuplicates" defaultChecked className="accent-navy-900" /> Skip rows whose phone already exists
            </label>
            <SubmitButton pendingText="Importing…">Import</SubmitButton>
          </ActionForm>

          {(user.isSuperAdmin || scopeFor(user, "crm.leads", "edit") === "all") && (
            <ActionForm action={importLeadsFull} className="mt-8 space-y-4 border-t border-line pt-6">
              <div>
                <h3 className="font-medium">Restore from Excel (with activities)</h3>
                <p className="mt-1 text-sm text-muted">
                  Upload a file from <b className="font-medium text-ink">Export → Excel with activities</b>, edited or not. Leads whose ID already exists are updated,
                  new IDs are created with the same number, and activities are added (ones already here are skipped, so importing twice is safe).
                </p>
              </div>
              <Field label="Excel file (.xlsx)">
                <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
              </Field>
              <SubmitButton pendingText="Importing…" variant="secondary">Import with activities</SubmitButton>
            </ActionForm>
          )}
        </Drawer>
      )}
    </>
  );
}
