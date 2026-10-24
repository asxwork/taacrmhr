import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeFor, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { crmReport, resolvePeriod, toCsv } from "@/lib/reports";

// CSV downloads. Each kind checks its module's `export` permission and applies the user's scope.
//   /api/export/leads?q=&status=&source=&owner=&closed=1
//   /api/export/deals?pipeline=&q=&owner=&stage=
//   /api/export/report?period=&from=&to=&branch=&owner=

const MODULE = { leads: "crm.leads", deals: "crm.deals", report: "reports.crm" } as const;

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const kind = (await params).kind as keyof typeof MODULE;
  const mod = MODULE[kind];
  if (!mod || !can(user, mod, "export")) return new Response("Forbidden", { status: 403 });

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  let rows: (string | number | null)[][] = [];

  if (kind === "leads") {
    const scope = (await scopeWhere(user, mod, "export"))!;
    const openIds = (await db.leadStatus.findMany({ where: { kind: "open" }, select: { id: true } })).map((s) => s.id);
    const where: Prisma.LeadWhereInput = {
      ...scope,
      ...(q && { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }, { location: { contains: q } }] }),
      ...(sp.get("status") ? { statusId: sp.get("status")! } : !sp.get("closed") && { statusId: { in: openIds } }),
      ...(sp.get("source") && { sourceId: sp.get("source")! }),
      ...(sp.get("owner") && { ownerId: sp.get("owner")! }),
    };
    const leads = await db.lead.findMany({ where, include: { status: true, source: true, owner: true, branch: true }, orderBy: { createdAt: "desc" }, take: 20000 });
    rows = [
      ["Name", "Phone", "Email", "Status", "Source", "Campaign", "Interest", "Property type", "Location", "Budget from", "Budget to", "Responsible", "Branch", "Created"],
      ...leads.map((l) => [l.name, l.phone, l.email, l.status.name, l.source?.name ?? "", l.campaign, l.interest, l.propertyType, l.location, l.budgetMin, l.budgetMax, l.owner?.name ?? "", l.branch?.name ?? "", format(l.createdAt, "yyyy-MM-dd HH:mm")]),
    ];
  } else if (kind === "deals") {
    const scope = (await scopeWhere(user, mod, "export"))!;
    const where: Prisma.DealWhereInput = {
      ...scope,
      ...(sp.get("pipeline") && { pipelineId: sp.get("pipeline")! }),
      ...(q && { OR: [{ title: { contains: q } }, { contact: { name: { contains: q } } }] }),
      ...(sp.get("owner") && { ownerId: sp.get("owner")! }),
      ...(sp.get("stage") && { stageId: sp.get("stage")! }),
    };
    const deals = await db.deal.findMany({ where, include: { stage: true, pipeline: true, contact: true, owner: true, branch: true, source: true }, orderBy: { createdAt: "desc" }, take: 20000 });
    rows = [
      ["Title", "Pipeline", "Stage", "Value", "Commission %", "Client", "Client phone", "Source", "Responsible", "Branch", "Expected close", "Closed", "Lost reason", "Created"],
      ...deals.map((d) => [d.title, d.pipeline.name, d.stage.name, d.value, d.commissionPct, d.contact?.name ?? "", d.contact?.phone ?? "", d.source?.name ?? "", d.owner?.name ?? "", d.branch?.name ?? "",
        d.expectedClose ? format(d.expectedClose, "yyyy-MM-dd") : "", d.closedAt ? format(d.closedAt, "yyyy-MM-dd") : "", d.lostReason, format(d.createdAt, "yyyy-MM-dd")]),
    ];
  } else {
    const { from, to } = resolvePeriod(sp.get("period") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined);
    const r = (await crmReport(user, { from, to, branchId: scopeFor(user, mod) === "all" ? sp.get("branch") ?? undefined : undefined, ownerId: sp.get("owner") ?? undefined }))!;
    rows = [
      ["Person", "Leads", "Converted", "Calls", "Meetings & visits", "Emails", "Deals won", "Won value", "Commission"],
      ...r.leaderboard.map((p) => [p.name, p.leads, p.converted, p.calls, p.meetings, p.emails, p.won, p.wonValue, Math.round(p.commission)]),
    ];
  }

  await audit(user.id, "export", kind, null, `Exported ${rows.length - 1} ${kind} row(s) to CSV`);
  return new Response("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${format(new Date(), "yyyy-MM-dd")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
