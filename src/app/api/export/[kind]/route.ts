import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeFor, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { crmReport, resolvePeriod, toCsv } from "@/lib/reports";
import { hrReport } from "@/lib/reports-hr";
import { LEAD_FILTER_KEYS, leadWhere, type LeadFilters } from "@/lib/lead-filters";

// CSV downloads. Each kind checks its module's `export` permission and applies the user's scope.
//   /api/export/leads?<same filters as the lead list>
//   /api/export/deals?pipeline=&q=&owner=&stage=
//   /api/export/report?period=&from=&to=&branch=&owner=
//   /api/export/hr?period=&from=&to=&branch=   (attendance summary)

const MODULE = { leads: "crm.leads", deals: "crm.deals", report: "reports.crm", hr: "reports.hr" } as const;

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
    // Same filters as the list page (and its saved presets), so the file matches the screen.
    const filters = Object.fromEntries(LEAD_FILTER_KEYS.filter((k) => sp.get(k)).map((k) => [k, sp.get(k)!])) as LeadFilters;
    const where = await leadWhere(user, filters, await db.leadStatus.findMany());
    const leads = await db.lead.findMany({ where, include: { status: true, source: true, owner: true, branch: true, project: true }, orderBy: { createdAt: "desc" }, take: 20000 });
    rows = [
      ["ID", "Name", "Phone", "Email", "Status", "Source", "Campaign", "Interest", "Property type", "Location", "Budget from", "Budget to", "Responsible", "Branch", "Created", "Project", "Source information"],
      ...leads.map((l) => [l.number, l.name, l.phone, l.email, l.status.name, l.source?.name ?? "", l.campaign, l.interest, l.propertyType, l.location, l.budgetMin, l.budgetMax, l.owner?.name ?? "", l.branch?.name ?? "", format(l.createdAt, "yyyy-MM-dd HH:mm"), l.project?.name ?? "", l.sourceInfo]),
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
  } else if (kind === "hr") {
    const { from, to } = resolvePeriod(sp.get("period") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined);
    const r = (await hrReport(user, { from, to, branchId: scopeFor(user, mod) === "all" ? sp.get("branch") ?? undefined : undefined }))!;
    rows = [
      ["Code", "Employee", "Department", "Branch", "Present", "Late", "Half day", "Absent", "Missing check-out", "Leave", "Holidays", "Worked hours", "Overtime hours", "Late minutes"],
      ...r.attendance.map((a) => [a.code, a.fullName, a.department?.name ?? "", a.branch?.name ?? "", a.present, a.late, a.half, a.absent, a.missing, a.leave, a.holiday, Math.round(a.workedMin / 6) / 10, Math.round(a.overtimeMin / 6) / 10, a.lateMin]),
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
