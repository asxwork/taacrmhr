import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { startOfMonth, subDays } from "date-fns";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { assignableUsers, color, fmtPKR, usersInScope } from "@/lib/crm";
import { cn, fmtDate } from "@/lib/utils";
import { Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Kanban } from "@/components/crm/kanban";
import { Pagination, StatusPill, ViewToggle, hrefWith } from "@/components/crm/bits";
import { DealForm } from "./deal-form";
import { moveDeal } from "./actions";

export const metadata = { title: "Deals" };

const PAGE_SIZE = 50;
type SP = { pipeline?: string; q?: string; owner?: string; stage?: string; view?: string; page?: string; new?: string; contact?: string };

export default async function DealsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("crm.deals");
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const page = Math.max(1, Number(sp.page) || 1);

  const pipelines = await db.pipeline.findMany({ include: { stages: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } });
  const pipeline = pipelines.find((p) => p.id === sp.pipeline) ?? pipelines.find((p) => p.isDefault) ?? pipelines[0]!;
  const keep = { pipeline: sp.pipeline, q: sp.q, owner: sp.owner, stage: sp.stage, view: sp.view };

  const scope = (await scopeWhere(user, "crm.deals"))!;
  const q = sp.q?.trim();
  const recentCutoff = subDays(new Date(), 30);
  const where: Prisma.DealWhereInput = {
    ...scope,
    pipelineId: pipeline.id,
    ...(q && { OR: [{ title: { contains: q } }, { contact: { name: { contains: q } } }, { contact: { phone: { contains: q } } }] }),
    ...(sp.owner && { ownerId: sp.owner }),
    ...(sp.stage && { stageId: sp.stage }),
    // Board: closed deals only from the last 30 days so won/lost columns stay short.
    ...(view === "board" && { OR: [{ closedAt: null }, { closedAt: { gte: recentCutoff } }] }),
  };

  const [deals, total, owners, assignees, canEditRow, summary, wonMonth] = await Promise.all([
    db.deal.findMany({
      where,
      include: { stage: true, contact: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      skip: view === "list" ? (page - 1) * PAGE_SIZE : 0,
      take: view === "list" ? PAGE_SIZE : 500,
    }),
    db.deal.count({ where }),
    usersInScope(user, "crm.deals", "view"),
    assignableUsers(user, "crm.deals"),
    scopeMatcher(user, "crm.deals", "edit"),
    db.deal.aggregate({ where: { ...scope, pipelineId: pipeline.id, closedAt: null }, _sum: { value: true }, _count: true }),
    db.deal.aggregate({ where: { ...scope, pipelineId: pipeline.id, stage: { kind: "won" }, closedAt: { gte: startOfMonth(new Date()) } }, _sum: { value: true }, _count: true }),
  ]);

  const canCreate = can(user, "crm.deals", "create");
  const canEdit = can(user, "crm.deals", "edit");
  const closeHref = hrefWith("/crm/deals", keep, {});

  const newDrawer = sp.new && canCreate
    ? await Promise.all([
        db.contact.findMany({ where: (await scopeWhere(user, "crm.contacts")) ?? { id: "" }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 500 }),
        db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      ])
    : null;

  return (
    <>
      <PageHeader
        title="Deals"
        actions={
          <>
            <ViewToggle base="/crm/deals" sp={keep} view={view} />
            {canCreate && (
              <LinkButton href={hrefWith("/crm/deals", keep, { new: "1" })} scroll={false}>
                <Plus className="size-4" /> New deal
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        {pipelines.length > 1 && (
          <div className="flex rounded-lg bg-black/5 p-0.5">
            {pipelines.map((p) => (
              <Link
                key={p.id}
                href={hrefWith("/crm/deals", { view: sp.view }, { pipeline: p.id })}
                className={cn("rounded-md px-3 py-1.5 text-sm", p.id === pipeline.id ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}
        <div className="flex gap-6 text-sm">
          <span><span className="text-muted">Open </span><b className="font-semibold">{summary._count}</b> · {fmtPKR(summary._sum.value ?? 0)}</span>
          <span><span className="text-muted">Won this month </span><b className="font-semibold">{wonMonth._count}</b> · {fmtPKR(wonMonth._sum.value ?? 0)}</span>
        </div>
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="pipeline" value={pipeline.id} />
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search deal or client" className="input pl-9" />
        </div>
        {view === "list" && (
          <select name="stage" defaultValue={sp.stage ?? ""} className="input w-40">
            <option value="">All stages</option>
            {pipeline.stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {owners.length > 1 && (
          <select name="owner" defaultValue={sp.owner ?? ""} className="input w-40">
            <option value="">Everyone</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}
        <button className="h-9 rounded-md border border-line bg-surface px-3 text-sm hover:bg-canvas">Apply</button>
      </form>

      {view === "board" ? (
        <Kanban
          showTotals
          columns={pipeline.stages.map((s) => ({ id: s.id, name: s.name, dot: color(s.color).dot, askReason: s.kind === "lost" }))}
          cards={deals.map((d) => ({
            id: d.id,
            columnId: d.stageId,
            title: d.title,
            href: `/crm/deals/${d.id}`,
            subtitle: d.contact?.name,
            amount: d.value ?? undefined,
            owner: d.owner?.name,
            draggable: canEdit && canEditRow(d),
          }))}
          onMove={moveDeal}
        />
      ) : (
        <Card className="overflow-hidden">
          {deals.length === 0 ? (
            <EmptyState title="No deals here" description="Convert a lead or create a deal." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-line bg-canvas/60">
                    <tr>
                      <th className="th">Deal</th>
                      <th className="th">Stage</th>
                      <th className="th">Value</th>
                      <th className="th">Expected close</th>
                      <th className="th">Responsible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {deals.map((d) => (
                      <tr key={d.id} className="hover:bg-canvas/60">
                        <td className="td">
                          <Link href={`/crm/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                          <p className="text-xs text-muted">{d.contact?.name ?? "—"}</p>
                        </td>
                        <td className="td"><StatusPill name={d.stage.name} colorName={d.stage.color} /></td>
                        <td className="td whitespace-nowrap">{fmtPKR(d.value)}</td>
                        <td className="td whitespace-nowrap text-muted">{fmtDate(d.expectedClose)}</td>
                        <td className="td text-muted">{d.owner?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination base="/crm/deals" sp={keep} page={page} pageSize={PAGE_SIZE} total={total} />
            </>
          )}
        </Card>
      )}

      {newDrawer && (
        <Drawer title="New deal" closeHref={closeHref}>
          <DealForm
            pipelines={pipelines}
            contacts={newDrawer[0]}
            sources={newDrawer[1]}
            owners={assignees}
            currentUserId={user.id}
            cancelHref={closeHref}
            defaultPipelineId={pipeline.id}
            defaultContactId={sp.contact}
          />
        </Drawer>
      )}
    </>
  );
}
