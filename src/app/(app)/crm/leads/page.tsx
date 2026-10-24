import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Plus, Search, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { assignableUsers, color, fmtPKR, usersInScope } from "@/lib/crm";
import { fmtAgo } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { Kanban } from "@/components/crm/kanban";
import { SelectAll } from "@/components/crm/select-all";
import { Pagination, StatusPill, ViewToggle, hrefWith } from "@/components/crm/bits";
import { LeadForm } from "./lead-form";
import { bulkLeads, importLeads, moveLead } from "./actions";

export const metadata = { title: "Leads" };

const PAGE_SIZE = 50;
type SP = { q?: string; status?: string; source?: string; owner?: string; closed?: string; view?: string; page?: string; new?: string; import?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("crm.leads");
  const sp = await searchParams;
  const view = sp.view === "board" ? "board" : "list";
  const page = Math.max(1, Number(sp.page) || 1);
  const keep = { q: sp.q, status: sp.status, source: sp.source, owner: sp.owner, closed: sp.closed, view: sp.view };

  const scope = (await scopeWhere(user, "crm.leads"))!;
  const [statuses, sources, owners, assignees, canEditRow] = await Promise.all([
    db.leadStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    usersInScope(user, "crm.leads", "view"),
    assignableUsers(user, "crm.leads"),
    scopeMatcher(user, "crm.leads", "edit"),
  ]);

  const openIds = statuses.filter((s) => s.kind === "open").map((s) => s.id);
  const q = sp.q?.trim();
  const where: Prisma.LeadWhereInput = {
    ...scope,
    ...(q && { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }, { location: { contains: q } }] }),
    ...(sp.status ? { statusId: sp.status } : !sp.closed && { statusId: { in: openIds } }),
    ...(sp.source && { sourceId: sp.source }),
    ...(sp.owner && { ownerId: sp.owner }),
  };

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: { status: true, source: true, owner: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: view === "list" ? (page - 1) * PAGE_SIZE : 0,
      take: view === "list" ? PAGE_SIZE : 500,
    }),
    db.lead.count({ where }),
  ]);

  const canCreate = can(user, "crm.leads", "create");
  const canEdit = can(user, "crm.leads", "edit");
  const canDelete = can(user, "crm.leads", "delete");
  const canAssign = assignees.length > 1;
  const closeHref = hrefWith("/crm/leads", keep, {});

  return (
    <>
      <PageHeader
        title="Leads"
        actions={
          <>
            <ViewToggle base="/crm/leads" sp={keep} view={view} />
            {canCreate && (
              <>
                <LinkButton href={hrefWith("/crm/leads", keep, { import: "1" })} variant="secondary" scroll={false}>
                  <Upload className="size-4" /> Import
                </LinkButton>
                <LinkButton href={hrefWith("/crm/leads", keep, { new: "1" })} scroll={false}>
                  <Plus className="size-4" /> New lead
                </LinkButton>
              </>
            )}
          </>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2">
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search name, phone, email, location" className="input pl-9" />
        </div>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-36">
          <option value="">Open statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className="input w-36">
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {owners.length > 1 && (
          <select name="owner" defaultValue={sp.owner ?? ""} className="input w-40">
            <option value="">Everyone</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
          <input type="checkbox" name="closed" value="1" defaultChecked={!!sp.closed} className="accent-navy-900" /> Include converted &amp; junk
        </label>
        <button className="h-9 rounded-md border border-line bg-surface px-3 text-sm hover:bg-canvas">Apply</button>
      </form>

      {view === "board" ? (
        <Kanban
          columns={statuses.filter((s) => sp.closed || s.kind === "open").map((s) => ({ id: s.id, name: s.name, dot: color(s.color).dot }))}
          cards={leads.map((l) => ({
            id: l.id,
            columnId: l.statusId,
            title: l.name,
            href: `/crm/leads/${l.id}`,
            subtitle: [l.propertyType, l.location].filter(Boolean).join(" · ") || l.phone || undefined,
            meta: l.source?.name,
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
              description={q || sp.status || sp.source || sp.owner ? "Try clearing filters." : "Create your first lead or import a CSV."}
              action={canCreate && <LinkButton href="/crm/leads?new=1" scroll={false}>New lead</LinkButton>}
            />
          ) : (
            <ActionForm action={bulkLeads}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-line bg-canvas/60">
                    <tr>
                      {canEdit && <th className="th w-10"><SelectAll /></th>}
                      <th className="th">Name</th>
                      <th className="th">Status</th>
                      <th className="th">Interest</th>
                      <th className="th">Budget</th>
                      <th className="th">Source</th>
                      <th className="th">Responsible</th>
                      <th className="th">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {leads.map((l) => (
                      <tr key={l.id} className="hover:bg-canvas/60">
                        {canEdit && (
                          <td className="td">
                            {canEditRow(l) && <input type="checkbox" name="ids" value={l.id} className="accent-navy-900" aria-label={`Select ${l.name}`} />}
                          </td>
                        )}
                        <td className="td">
                          <Link href={`/crm/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
                          <p className="text-xs text-muted">{l.phone ?? l.email}</p>
                        </td>
                        <td className="td"><StatusPill name={l.status.name} colorName={l.status.color} /></td>
                        <td className="td text-muted">
                          <span className="capitalize">{l.interest ?? "—"}</span>
                          {l.propertyType && ` · ${l.propertyType}`}
                          {l.location && <p className="text-xs">{l.location}</p>}
                        </td>
                        <td className="td whitespace-nowrap">{fmtPKR(l.budgetMax ?? l.budgetMin)}</td>
                        <td className="td text-muted">{l.source?.name ?? "—"}</td>
                        <td className="td text-muted">{l.owner?.name ?? "—"}</td>
                        <td className="td whitespace-nowrap text-muted">{fmtAgo(l.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/40 px-4 py-2.5">
                  <span className="text-xs text-muted">With selected:</span>
                  <select name="op" className="input h-8 w-36 text-xs" defaultValue="">
                    <option value="" disabled>Choose action</option>
                    {canAssign && <option value="assign">Assign to…</option>}
                    <option value="status">Change status…</option>
                    {canDelete && <option value="delete">Delete</option>}
                  </select>
                  {canAssign && (
                    <select name="ownerId" className="input h-8 w-40 text-xs" defaultValue="">
                      <option value="">— person —</option>
                      {assignees.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  )}
                  <select name="statusId" className="input h-8 w-36 text-xs" defaultValue="">
                    <option value="">— status —</option>
                    {statuses.filter((s) => s.kind !== "converted").map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <SubmitButton variant="secondary" className="h-8 text-xs">Apply</SubmitButton>
                </div>
              )}
              <Pagination base="/crm/leads" sp={keep} page={page} pageSize={PAGE_SIZE} total={total} />
            </ActionForm>
          )}
        </Card>
      )}

      {sp.new && canCreate && (
        <Drawer title="New lead" closeHref={closeHref}>
          <LeadForm sources={sources} owners={assignees} currentUserId={user.id} cancelHref={closeHref} />
        </Drawer>
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
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            {canAssign && (
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-xs font-medium text-ink/80">Assign to</legend>
                <select name="assign" className="input" defaultValue={user.id}>
                  {assignees.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
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
        </Drawer>
      )}
    </>
  );
}
