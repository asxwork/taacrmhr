import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Pencil, Phone, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeMatcher, scopeWhere } from "@/lib/permissions";
import { TIMELINE_INCLUDE, assignableUsers, editableActivityIds, fmtPKR } from "@/lib/crm";
import { fmtDate } from "@/lib/utils";
import { SubmitButton } from "@/components/action-form";
import { Button, Card, Drawer, Field, LinkButton } from "@/components/ui";
import { InfoList, StageBar, StatusPill } from "@/components/crm/bits";
import { Composer } from "@/components/crm/composer";
import { Timeline } from "@/components/crm/timeline";
import { DealForm } from "../deal-form";
import { deleteDeal, setDealStage } from "../actions";

export const metadata = { title: "Deal" };

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; lost?: string }> }) {
  const user = await requirePermission("crm.deals");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = (await scopeWhere(user, "crm.deals"))!;
  const deal = await db.deal.findFirst({
    where: { id, ...scope },
    include: { stage: true, pipeline: { include: { stages: { orderBy: { sortOrder: "asc" } } } }, contact: true, lead: true, owner: true, branch: true, source: true },
  });
  if (!deal) notFound();

  const path = `/crm/deals/${id}`;
  const canEdit = can(user, "crm.deals", "edit") && (await scopeMatcher(user, "crm.deals", "edit"))(deal);
  const canDelete = can(user, "crm.deals", "delete") && (await scopeMatcher(user, "crm.deals", "delete"))(deal);
  const openStages = deal.pipeline.stages.filter((s) => s.kind === "open");
  const won = deal.pipeline.stages.find((s) => s.kind === "won");
  const lost = deal.pipeline.stages.find((s) => s.kind === "lost");
  const closed = deal.stage.kind !== "open";

  const [activities, actOwners] = await Promise.all([
    db.activity.findMany({
      where: { OR: [{ dealId: id }, ...(deal.leadId ? [{ leadId: deal.leadId }] : [])] },
      include: { ...TIMELINE_INCLUDE, lead: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    assignableUsers(user, "crm.activities"),
  ]);
  const editableIds = await editableActivityIds(user, activities.map((a) => a.id));
  const items = activities.map((a) => ({ ...a, context: a.lead && !a.dealId ? { label: "from lead", href: `/crm/leads/${a.lead.id}` } : null }));

  const editData = sp.edit && canEdit
    ? await Promise.all([
        db.contact.findMany({ where: (await scopeWhere(user, "crm.contacts")) ?? { id: "" }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 500 }),
        db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
        assignableUsers(user, "crm.deals"),
      ])
    : null;
  const commission = deal.value && deal.commissionPct ? (deal.value * deal.commissionPct) / 100 : null;
  const wa = deal.contact?.phoneKey?.replace(/^0/, "92");

  return (
    <>
      <Link href={`/crm/deals?pipeline=${deal.pipelineId}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {deal.pipeline.name} pipeline
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{deal.title}</h1>
            <StatusPill name={deal.stage.name} colorName={deal.stage.color} />
          </div>
          <p className="mt-1 text-2xl font-semibold text-navy-900">{fmtPKR(deal.value)}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}>
              <Pencil className="size-4" /> Edit
            </LinkButton>
          )}
          {canEdit && !closed && won && (
            <form action={setDealStage}>
              <input type="hidden" name="dealId" value={id} />
              <button name="stepId" value={won.id} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 text-sm font-medium text-white hover:bg-emerald-700">
                <ThumbsUp className="size-4" /> Won
              </button>
            </form>
          )}
          {canEdit && !closed && lost && (
            <LinkButton href={`${path}?lost=1`} variant="danger" scroll={false}>
              <ThumbsDown className="size-4" /> Lost
            </LinkButton>
          )}
        </div>
      </div>

      {closed ? (
        <form action={setDealStage} className={`mb-6 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${deal.stage.kind === "won" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-red-100 bg-red-50 text-red-700"}`}>
          <input type="hidden" name="dealId" value={id} />
          {deal.stage.kind === "won" ? "Deal won" : `Deal lost${deal.lostReason ? `: ${deal.lostReason}` : ""}`} on {fmtDate(deal.closedAt)}.
          {canEdit && openStages[0] && <button name="stepId" value={openStages.at(-1)!.id} className="font-medium underline">Reopen</button>}
        </form>
      ) : (
        <div className="mb-6">
          <StageBar steps={openStages} currentId={deal.stageId} action={setDealStage} hidden={{ dealId: id }} disabled={!canEdit} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          {deal.contact && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-medium">Client</h2>
              <Link href={`/crm/contacts/${deal.contact.id}`} className="font-medium hover:underline">{deal.contact.name}</Link>
              <div className="mt-2 flex flex-wrap gap-2">
                {deal.contact.phone && (
                  <a href={`tel:${deal.contact.phone}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-sm hover:bg-canvas">
                    <Phone className="size-3.5" /> {deal.contact.phone}
                  </a>
                )}
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-sm text-emerald-700 hover:bg-emerald-50">
                    <MessageCircle className="size-3.5" /> WhatsApp
                  </a>
                )}
              </div>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Details</h2>
            <InfoList
              rows={[
                ["Responsible", deal.owner?.name],
                ["Branch", deal.branch?.name],
                ["Expected close", fmtDate(deal.expectedClose)],
                ["Probability", `${deal.stage.probability}%`],
                ["Commission", deal.commissionPct ? `${deal.commissionPct}%${commission ? ` · ${fmtPKR(commission)}` : ""}` : null],
                ["Source", deal.source?.name],
                ["From lead", deal.lead ? <Link key="l" href={`/crm/leads/${deal.lead.id}`} className="hover:underline">{deal.lead.name}</Link> : null],
                ["Created", fmtDate(deal.createdAt)],
              ]}
            />
            {deal.notes && <p className="mt-3 whitespace-pre-line rounded-md bg-canvas p-3 text-sm">{deal.notes}</p>}
          </Card>
          <p className="px-1 text-xs text-muted">Property units will link here in Phase 2 (Inventory).</p>
          {canDelete && (
            <form action={deleteDeal}>
              <input type="hidden" name="id" value={id} />
              <Button variant="ghost" className="text-muted hover:text-red-600">
                <Trash2 className="size-4" /> Delete deal
              </Button>
            </form>
          )}
        </div>

        <div className="space-y-6">
          {can(user, "crm.activities", "create") && <Composer entity={{ dealId: id }} path={path} users={actOwners} currentUserId={user.id} />}
          <Timeline items={items} path={path} editableIds={editableIds} />
        </div>
      </div>

      {editData && (
        <Drawer title="Edit deal" closeHref={path}>
          <DealForm deal={deal} pipelines={[]} contacts={editData[0]} sources={editData[1]} owners={editData[2]} currentUserId={user.id} cancelHref={path} />
        </Drawer>
      )}

      {sp.lost && canEdit && lost && !closed && (
        <Drawer title="Mark deal as lost" closeHref={path} width="max-w-md">
          <form action={setDealStage} className="space-y-4">
            <input type="hidden" name="dealId" value={id} />
            <input type="hidden" name="stepId" value={lost.id} />
            <Field label="Reason">
              <input name="reason" required autoFocus className="input" placeholder="e.g. Budget mismatch, bought elsewhere" />
            </Field>
            <SubmitButton variant="danger">Mark lost</SubmitButton>
          </form>
        </Drawer>
      )}
    </>
  );
}
