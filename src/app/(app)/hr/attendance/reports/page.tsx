import Link from "@/components/link";
import { formatDistanceToNow } from "date-fns";
import { Mail, Send, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ATT_REPORTS } from "@/lib/attendance-reports";
import { ATT_TEMPLATES, filtersQuery, templateByKey, type AttFilters } from "@/lib/attendance-templates-shared";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AttTemplateList } from "@/components/hr/att-template-list";
import { deleteAttPreset, sendAttPresetNow } from "./actions";

export const metadata = { title: "Attendance Reports" };

const SCHEDULE_LABEL: Record<string, string> = { daily: "Every morning", weekly: "Mondays", monthly: "1st of month" };

/** HR → Attendance → Reports: saved presets, then every ready-made report grouped by what it answers. */
export default async function AttendanceReportsHome() {
  const user = await requirePermission("hr.attendance");
  const presets = await db.attReportPreset.findMany({ where: { OR: [{ createdById: user.id }, { shared: true }] }, orderBy: { createdAt: "desc" }, take: 50 });
  const owners = new Map((await db.user.findMany({ where: { id: { in: [...new Set(presets.map((p) => p.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const items = [
    ...ATT_TEMPLATES.map((t) => ({ key: t.key, name: t.name, group: t.group, desc: t.desc, href: `/hr/attendance/reports/${t.key}` })),
    ...ATT_REPORTS.map((r) => ({ key: r.value, name: `${r.label} report`, group: "Planning", desc: r.description, href: `/hr/attendance/reports/${r.value}` })),
  ];

  return (
    <>
      <PageHeader title="Attendance reports" description="Pick a report, set the filters, generate. Save the ones you use as presets, or have them emailed." />
      {presets.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Saved presets</h2>
          <ul className="divide-y divide-line">
            {presets.map((p) => {
              const t = templateByKey(p.template);
              let f: AttFilters = {};
              try { f = JSON.parse(p.filters); } catch {}
              const mine = p.createdById === user.id || user.isSuperAdmin;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <Link href={`/hr/attendance/reports/${p.template}?${filtersQuery(f)}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:underline">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{t?.name ?? p.template}{p.shared ? " · shared" : ""}{p.createdById !== user.id ? ` · by ${owners.get(p.createdById) ?? "—"}` : ""}</span>
                  </Link>
                  {p.schedule && <Badge tone="navy"><Mail className="mr-1 inline size-3" />{SCHEDULE_LABEL[p.schedule]}{p.lastSentAt ? ` · sent ${formatDistanceToNow(p.lastSentAt, { addSuffix: true })}` : ""}</Badge>}
                  {mine && (
                    <span className="flex items-center gap-1">
                      {p.schedule && <form action={sendAttPresetNow}><input type="hidden" name="id" value={p.id} /><button className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink" title="Email it now" aria-label="Email it now"><Send className="size-4" /></button></form>}
                      <form action={deleteAttPreset}><input type="hidden" name="id" value={p.id} /><button className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-red-600" title="Delete" aria-label="Delete preset"><Trash2 className="size-4" /></button></form>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <AttTemplateList items={items} />
    </>
  );
}
