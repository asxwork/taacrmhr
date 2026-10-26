import Link from "next/link";
import { format, isToday, parse, startOfDay } from "date-fns";
import { ChevronRight, Sunrise, Timer } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { ATTENDANCE_DRILL, attendanceEmployeeWhere, loadAttendance, type DayResult } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { hrefWith } from "@/components/crm/bits";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "HR Dashboard" };

// Translucent tints read well on both the light and dark themes. Static strings so Tailwind keeps them.
const TONES: Record<string, { tile: string; bar: string; num: string }> = {
  navy: { tile: "bg-navy-900/[0.06] border-navy-900/10", bar: "bg-navy-700", num: "text-navy-900" },
  green: { tile: "bg-emerald-500/10 border-emerald-500/20", bar: "bg-emerald-500", num: "text-emerald-600" },
  red: { tile: "bg-red-500/10 border-red-500/20", bar: "bg-red-500", num: "text-red-600" },
  amber: { tile: "bg-amber-500/10 border-amber-500/20", bar: "bg-amber-500", num: "text-amber-600" },
  violet: { tile: "bg-violet-500/10 border-violet-500/20", bar: "bg-violet-500", num: "text-violet-600" },
  orange: { tile: "bg-orange-500/10 border-orange-500/20", bar: "bg-orange-500", num: "text-orange-600" },
  fuchsia: { tile: "bg-fuchsia-500/10 border-fuchsia-500/20", bar: "bg-fuchsia-500", num: "text-fuchsia-600" },
  blue: { tile: "bg-blue-500/10 border-blue-500/20", bar: "bg-blue-500", num: "text-blue-600" },
  teal: { tile: "bg-teal-500/10 border-teal-500/20", bar: "bg-teal-500", num: "text-teal-600" },
  slate: { tile: "bg-slate-500/10 border-slate-500/20", bar: "bg-slate-400", num: "text-slate-500" },
  sky: { tile: "bg-sky-500/10 border-sky-500/20", bar: "bg-sky-500", num: "text-sky-600" },
};

type SP = { date?: string; branch?: string };

/** HR app home (ResourceInn-style): attendance drill-down by day, early risers and late comers. */
export default async function HrDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const now = new Date();
  const picked = sp.date ? parse(sp.date, "yyyy-MM-dd", now) : now;
  const date = Number.isNaN(picked.getTime()) || picked > now ? startOfDay(now) : startOfDay(picked);
  const dateKey = format(date, "yyyy-MM-dd");

  const scope = (await attendanceEmployeeWhere(user))!;
  const [employees, branches] = await Promise.all([
    db.employee.findMany({
      where: { ...scope, status: { not: "left" }, ...(sp.branch && { branchId: sp.branch }) },
      select: { id: true, fullName: true, photo: true, code: true, designation: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    scopeFor(user, "hr.attendance") === "all" ? db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const att = employees.length ? await loadAttendance(employees.map((e) => e.id), date, date) : new Map<string, DayResult[]>();
  const rows = employees.map((e) => ({ e, d: att.get(e.id)?.[0] })).filter((r): r is { e: (typeof employees)[number]; d: DayResult } => !!r.d);

  const link = (status?: string) => hrefWith("/hr/attendance", { date: isToday(date) ? undefined : dateKey, branch: sp.branch, status }, {});
  const tiles = [
    { key: "active", label: "Active employees", tone: "navy", count: employees.length, href: "/hr/employees" },
    ...ATTENDANCE_DRILL.map((c) => ({ key: c.key, label: c.label, tone: c.tone, count: rows.filter((r) => c.test(r.d)).length, href: link(c.key) })),
  ];
  const earlyRisers = rows.filter((r) => r.d.checkIn).sort((a, b) => +a.d.checkIn! - +b.d.checkIn!).slice(0, 8);
  const lateComers = rows.filter((r) => r.d.lateMin > 0).sort((a, b) => b.d.lateMin - a.d.lateMin).slice(0, 8);

  return (
    <>
      <PageHeader title="HR Dashboard" description={`Attendance for ${format(date, "EEEE d MMMM yyyy")}${isToday(date) ? " (today, live)" : ""}.`} />

      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="flex-1 font-medium">Attendance drill-down{branches.length > 1 ? " by branch" : ""}</h2>
          <AutoFilterForm className="flex flex-wrap gap-2">
            {branches.length > 1 && (
              <select name="branch" defaultValue={sp.branch ?? ""} className="input h-9 w-40" aria-label="Branch">
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <input type="date" name="date" defaultValue={dateKey} max={format(now, "yyyy-MM-dd")} className="input h-9 w-40" aria-label="Date" />
          </AutoFilterForm>
        </div>
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {tiles.map((t) => {
            const tone = TONES[t.tone] ?? TONES.slate!;
            return (
              <Link key={t.key} href={t.href} className={cn("group relative overflow-hidden rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md", tone.tile)}>
                <span className={cn("mb-3 block h-0.5 w-6 rounded-full", tone.bar)} />
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">{t.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
                </span>
                <span className={cn("mt-1 block text-2xl font-semibold tabular-nums", t.count ? tone.num : "text-muted")}>{t.count}</span>
              </Link>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <PeopleList title="Early risers" icon={<Sunrise className="size-4 text-amber-500" />} empty="No one has checked in yet."
          rows={earlyRisers.map(({ e, d }) => ({ e, value: format(d.checkIn!, "h:mm a"), sub: e.designation?.name ?? e.code }))} />
        <PeopleList title="Late comers" icon={<Timer className="size-4 text-red-500" />} empty="No late arrivals."
          rows={lateComers.map(({ e, d }) => ({ e, value: `${d.lateMin} min late`, sub: `In at ${format(d.checkIn!, "h:mm a")}`, tone: "text-red-600" }))} />
      </div>
    </>
  );
}

function PeopleList({ title, icon, empty, rows }: {
  title: string; icon: React.ReactNode; empty: string;
  rows: { e: { id: string; fullName: string; photo: string | null }; value: string; sub: string; tone?: string }[];
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 font-medium">{icon} {title}</h2>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">{empty}</p> : (
        <ul className="divide-y divide-line">
          {rows.map(({ e, value, sub, tone }) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <PersonAvatar name={e.fullName} photo={e.photo} />
              <Link href={`/hr/employees/${e.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium hover:underline">{e.fullName}</span>
                <span className="block truncate text-xs text-muted">{sub}</span>
              </Link>
              <span className={cn("shrink-0 text-sm font-medium tabular-nums", tone)}>{value}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
