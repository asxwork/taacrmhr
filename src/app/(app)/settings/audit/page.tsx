import Link from "@/components/link";
import type { Prisma } from "@prisma/client";
import { endOfDay, parse, startOfDay } from "date-fns";
import { Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { ACTIVITY_CATEGORIES, categoryOf, entityFilter, type ActivityCategory } from "@/lib/activity-log";
import { cn, fmtDateTime } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { deleteOldActivity } from "./actions";

export const metadata = { title: "Activity Log" };

const TONE = { create: "green", update: "navy", delete: "red", login: "neutral", logout: "neutral", checkin: "green", import: "navy", hr_edit: "amber", correction: "amber" } as const;
const ACTION_LABEL: Record<string, string> = { create: "Added", update: "Changed", delete: "Deleted", login: "Signed in", logout: "Signed out", checkin: "Check-in", import: "Machine import", hr_edit: "HR edit", correction: "Correction" };
const PAGE = 100;
type SP = { cat?: string; q?: string; who?: string; from?: string; to?: string; page?: string };
type Row = { id: string; at: Date; action: string; summary: string; who: string; cat: ActivityCategory };

/** Settings → Activity Log: everything that happens in AMS, by category. Only Super Admins can delete old entries. */
export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("settings.audit");
  const sp = await searchParams;
  const cat = ACTIVITY_CATEGORIES.find((c) => c.key === sp.cat)?.key;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const range = { ...(sp.from && { gte: startOfDay(parse(sp.from, "yyyy-MM-dd", new Date())) }), ...(sp.to && { lte: endOfDay(parse(sp.to, "yyyy-MM-dd", new Date())) }) };
  const auditWhere: Prisma.AuditLogWhereInput = {
    ...(cat && entityFilter(cat)),
    ...(q && { summary: { contains: q } }),
    ...(sp.who && { userId: sp.who }),
    ...((sp.from || sp.to) && { createdAt: range }),
  };
  const withAttendance = !cat || cat === "attendance";
  const attWhere: Prisma.AttendanceLogWhereInput = { ...(q && { summary: { contains: q } }), ...(sp.who && { byId: sp.who }), ...((sp.from || sp.to) && { createdAt: range }) };
  const take = page * PAGE;

  const [audits, atts, counts, attCount, people] = await Promise.all([
    db.auditLog.findMany({ where: auditWhere, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take }),
    withAttendance ? db.attendanceLog.findMany({ where: attWhere, orderBy: { createdAt: "desc" }, take }) : [],
    db.auditLog.groupBy({ by: ["entity"], _count: true }),
    db.attendanceLog.count(),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const rows: Row[] = [
    ...audits.map((l) => ({ id: l.id, at: l.createdAt, action: l.action, summary: l.summary, who: l.user?.name ?? "System", cat: categoryOf(l.entity) })),
    ...atts.map((l) => ({ id: `att-${l.id}`, at: l.createdAt, action: l.kind, summary: l.summary, who: l.byName ?? "System", cat: "attendance" as const })),
  ].sort((a, b) => +b.at - +a.at);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const more = rows.length > page * PAGE;
  const catCount = (k: ActivityCategory) => counts.filter((c) => categoryOf(c.entity) === k).reduce((s, c) => s + c._count, 0) + (k === "attendance" ? attCount : 0);
  const total = counts.reduce((s, c) => s + c._count, 0) + attCount;
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ cat: sp.cat, q: sp.q, who: sp.who, from: sp.from, to: sp.to, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/settings/audit${p.size ? `?${p}` : ""}`;
  };
  const catLabel = (k: ActivityCategory) => ACTIVITY_CATEGORIES.find((c) => c.key === k)!.label;

  return (
    <>
      <PageHeader title="Activity Log" description="Everything that happens in AMS: who did what, and when, by category." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={link({ cat: undefined, page: undefined })} className={cn("rounded-full border px-3 py-1.5 text-sm", !cat ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-muted hover:text-ink")}>All <span className="tabular-nums opacity-70">{total}</span></Link>
        {ACTIVITY_CATEGORIES.map((c) => (
          <Link key={c.key} href={link({ cat: c.key, page: undefined })} className={cn("rounded-full border px-3 py-1.5 text-sm", cat === c.key ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-muted hover:text-ink")}>
            {c.label} <span className="tabular-nums opacity-70">{catCount(c.key)}</span>
          </Link>
        ))}
      </div>
      <AutoFilterForm className="mb-4 flex flex-wrap gap-2">
        {cat && <input type="hidden" name="cat" value={cat} />}
        <label className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input name="q" defaultValue={q} placeholder="Search what happened" aria-label="Search" className="input pl-9" /></label>
        <select name="who" defaultValue={sp.who ?? ""} aria-label="Who" className="input w-auto min-w-44"><option value="">Anyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input name="from" type="date" defaultValue={sp.from} aria-label="From" className="input w-auto" />
        <input name="to" type="date" defaultValue={sp.to} aria-label="To" className="input w-auto" />
      </AutoFilterForm>

      <Card className="overflow-hidden">
        {shown.length === 0 ? <EmptyState title="Nothing here" description={q || sp.who || sp.from ? "Nothing matches these filters." : undefined} /> : (
          <ul className="divide-y divide-line">
            {shown.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <Badge tone={TONE[l.action as keyof typeof TONE] ?? "neutral"}>{ACTION_LABEL[l.action] ?? l.action}</Badge>
                <span className="min-w-60 flex-1">{l.summary}</span>
                {!cat && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{catLabel(l.cat)}</span>}
                <span className="w-36 truncate text-muted">{l.who}</span>
                <span className="w-40 text-right text-xs text-muted">{fmtDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        )}
        {(page > 1 || more) && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            {page > 1 ? <Link href={link({ page: String(page - 1) })} className="font-medium text-navy-900 hover:underline">← Newer</Link> : <span />}
            {more && <Link href={link({ page: String(page + 1) })} className="font-medium text-navy-900 hover:underline">Older →</Link>}
          </div>
        )}
      </Card>

      {user.isSuperAdmin && (
        <Card className="mt-6 border-red-200 p-5">
          <p className="flex items-center gap-2 font-medium"><Trash2 className="size-4 text-red-600" /> Delete old activity <span className="text-xs font-normal text-muted">(Super Admin only)</span></p>
          <p className="mb-3 text-sm text-muted">Removes entries older than the chosen age{cat ? ` in ${catLabel(cat)}` : " in every category"}. Recent activity is always kept, and this clean-up is itself logged.</p>
          <ActionForm action={deleteOldActivity} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="cat" value={cat ?? ""} />
            <select name="days" defaultValue="180" aria-label="Older than" className="input w-auto"><option value="30">Older than 30 days</option><option value="90">Older than 90 days</option><option value="180">Older than 6 months</option><option value="365">Older than 1 year</option></select>
            <SubmitButton variant="danger">Delete old entries</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
