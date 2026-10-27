import Link from "next/link";
import { differenceInMinutes, format, isToday, parse, startOfDay } from "date-fns";
import { Award, Cake, FileCheck2, FileWarning, Gift, Mail, Newspaper, Quote, Sunrise, Timer, Trash2, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { ATTENDANCE_DRILL, DAY_STATUSES, attendanceEmployeeWhere, fmtMinutes, geofenceMode, loadAttendance, type DayResult } from "@/lib/attendance";
import { companyWidgets, myWidgets } from "@/lib/hr-dashboard";
import { policiesFor } from "@/lib/policies";
import { hiddenWidgets, type WidgetKey } from "@/lib/hr-dashboard-widgets";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { hrefWith } from "@/components/crm/bits";
import { PersonAvatar } from "@/components/person-avatar";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { DrillTiles } from "@/components/drill-tiles";
import { BarList } from "@/components/charts";
import { LineChart } from "@/components/line-chart";
import { LiveClock } from "@/components/live-clock";
import { CheckInButton } from "../me/attendance/check-in-button";
import { addHrPost, deleteHrPost, sendHrSupport } from "./dashboard-actions";

export const metadata = { title: "HR Dashboard" };

type SP = { date?: string; branch?: string };
const TZ = process.env.APP_TIMEZONE ?? "Asia/Karachi";

/** HR app home in the ResourceInn layout: every widget opens the list behind it. */
export default async function HrDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const now = new Date();
  const picked = sp.date ? parse(sp.date, "yyyy-MM-dd", now) : now;
  const date = Number.isNaN(picked.getTime()) || picked > now ? startOfDay(now) : startOfDay(picked);
  const dateKey = format(date, "yyyy-MM-dd");

  const scope = (await attendanceEmployeeWhere(user))!;
  const isHr = can(user, "hr.employees", "edit");
  const [employees, branches, company, mine, mode, staff] = await Promise.all([
    db.employee.findMany({
      where: { ...scope, status: { not: "left" }, ...(sp.branch && { branchId: sp.branch }) },
      select: { id: true, fullName: true, photo: true, code: true, designation: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    }),
    scopeFor(user, "hr.attendance") === "all" ? db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    companyWidgets(scope),
    myWidgets(user.id),
    geofenceMode(),
    isHr ? db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }) : [],
  ]);
  const att = employees.length ? await loadAttendance(employees.map((e) => e.id), date, date) : new Map<string, DayResult[]>();
  const policies = mine ? await policiesFor(mine.employeeId) : (await db.policy.findMany({ where: { status: "published" }, orderBy: { publishedAt: "desc" } })).map((p) => ({ ...p, ackAt: null }));
  const rows = employees.map((e) => ({ e, d: att.get(e.id)?.[0] })).filter((r): r is { e: (typeof employees)[number]; d: DayResult } => !!r.d);

  const link = (status?: string) => hrefWith("/hr/attendance", { date: isToday(date) ? undefined : dateKey, branch: sp.branch, status }, {});
  const tiles = [
    { key: "active", label: "Active Employees", tone: "navy", value: employees.length, href: sp.branch ? `/hr/employees?branch=${sp.branch}` : "/hr/employees" },
    ...ATTENDANCE_DRILL.map((c) => ({ key: c.key, label: c.label, tone: c.tone, value: rows.filter((r) => c.test(r.d)).length, href: link(c.key) })),
  ];
  const earlyRisers = rows.filter((r) => r.d.checkIn).sort((a, b) => +a.d.checkIn! - +b.d.checkIn!).slice(0, 6);
  const lateComers = rows.filter((r) => r.d.lateMin > 0).sort((a, b) => b.d.lateMin - a.d.lateMin).slice(0, 6);
  const k = company.kpis;
  const hidden = await hiddenWidgets(); // System Settings → Customization → Dashboard
  const show = (w: WidgetKey) => !hidden.has(w);
  const h = company.headcount;

  return (
    <>
      <PageHeader title="Dashboard" description={`${format(now, "EEEE d MMMM yyyy")} · ${TZ}`} />

      {show("drill") && (<>
      {/* Attendance drill-down */}
      <Widget title={`Attendance Drill Down${branches.length > 1 ? " By Branch" : ""}`} className="mb-6"
        action={
          <AutoFilterForm className="flex flex-wrap gap-2">
            {branches.length > 1 && (
              <select name="branch" defaultValue={sp.branch ?? ""} className="input h-8 w-40 text-xs" aria-label="Branch">
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <input type="date" name="date" defaultValue={dateKey} max={format(now, "yyyy-MM-dd")} className="input h-8 w-36 text-xs" aria-label="Date" />
          </AutoFilterForm>
        }>
        <DrillTiles tiles={tiles} className="xl:grid-cols-4 2xl:grid-cols-5" />
      </Widget>
      </>)}

      {show("risers") && (<>
      <Grid>
        <PeopleList title="Early Risers" icon={<Sunrise className="size-4 text-amber-500" />}
          rows={earlyRisers.map(({ e, d }) => ({ e, value: format(d.checkIn!, "h:mm a"), sub: e.designation?.name ?? e.code }))} />
        <PeopleList title="Late Comers" icon={<Timer className="size-4 text-red-500" />} action={<span className="text-xs text-muted">{format(date, "MMMM d, yyyy")}</span>}
          rows={lateComers.map(({ e, d }) => ({ e, value: `${d.lateMin} min late`, sub: `In at ${format(d.checkIn!, "h:mm a")}`, tone: "text-red-600" }))} />
      </Grid>
      </>)}

      {show("kpis") && (<>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi tone="from-emerald-600 to-emerald-800" value={k.active} label="Active Employees" href="/hr/employees" />
        <Kpi tone="from-sky-600 to-sky-800" value={k.separations30} label="Separations in 30 Days" href="/hr/exits" />
        <Kpi tone="from-amber-500 to-amber-700" value={k.confirmations30} label="Confirmations in 30 Days" href="/hr/employees?status=probation" />
        <Kpi tone="from-red-600 to-red-800" value={k.separationsMonth} label="Separation This Month" href="/hr/exits?tab=left" />
      </div>
      </>)}

      {show("me") && (<>
      {/* Me: clock in/out, leave summary, clock */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Widget title="Mark Clock In/Clock Out">
          {mine ? (
            <div className="space-y-3">
              <div className="flex justify-between text-xs text-muted">
                <span>⟶ {mine.shift ? `${mine.shift.start}` : "—"} shift start</span><span>{mine.shift ? mine.shift.end : "—"} shift end</span>
              </div>
              <p className="text-center font-display text-2xl tabular-nums">
                {mine.punches.length ? fmtMinutes(differenceInMinutes(mine.punches.length % 2 ? now : mine.punches.at(-1)!.at, mine.punches[0]!.at)) : "00:00"}
              </p>
              <CheckInButton checkedIn={mine.punches.length % 2 === 1} needsLocation={mode !== "off" && mine.needsLocation} />
              {mine.punches.length > 0 && (
                <p className="text-center text-xs text-muted">{mine.punches.map((p, i) => `${i % 2 ? "Out" : "In"} ${format(p.at, "h:mm a")}`).join(" · ")}</p>
              )}
            </div>
          ) : <Empty text="Your login isn't linked to an employee record." />}
        </Widget>
        <Widget title="Leave Summary" action={<Link href="/me/leave" className="text-xs text-navy-700 hover:underline">Apply</Link>}>
          {mine?.balances.length ? (
            <ul className="space-y-3">
              {mine.balances.filter((b) => !b.unlimited).map((b) => {
                const total = b.entitled + b.carried + b.adjusted || 1;
                return (
                  <li key={b.type.id}>
                    <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{b.type.name}</span><span className="text-muted">Total {total} · Availed {b.used} · Pending {b.pending} · <b className="text-ink">Available {b.available}</b></span></div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-canvas">
                      <span className="bg-blue-500" style={{ width: `${(b.used / total) * 100}%` }} />
                      <span className="bg-amber-400" style={{ width: `${(b.pending / total) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty />}
        </Widget>
        <Widget title="Clock"><LiveClock timeZone={TZ} /></Widget>
      </div>
      </>)}

      {show("posts") && (<>
      {/* Accolades / News Letter / Words of Wisdom */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {company.posts.map(({ kind, rows: posts }) => (
          <Widget key={kind} title={kind === "accolade" ? "Accolades" : kind === "news" ? "News Letter" : "Words of Wisdom"}
            icon={kind === "accolade" ? <Award className="size-4 text-gold-600" /> : kind === "news" ? <Newspaper className="size-4 text-sky-600" /> : <Quote className="size-4 text-violet-600" />}>
            {posts.length ? (
              <ul className="space-y-3">
                {posts.map((p) => (
                  <li key={p.id} className="group flex gap-3">
                    {p.employee && <PersonAvatar name={p.employee.fullName} photo={p.employee.photo} />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", kind === "wisdom" && "italic")}>{kind === "wisdom" ? `“${p.title}”` : p.title}</p>
                      {p.employee && <Link href={`/hr/employees/${p.employeeId}`} className="text-xs text-muted hover:underline">{p.employee.fullName}</Link>}
                      {p.body && <p className="mt-0.5 line-clamp-3 text-xs text-muted">{p.body}</p>}
                      <p className="text-[11px] text-muted">{format(p.createdAt, "d MMM yyyy")}</p>
                    </div>
                    {isHr && (
                      <form action={deleteHrPost} className="opacity-0 transition group-hover:opacity-100">
                        <input type="hidden" name="id" value={p.id} />
                        <button aria-label="Delete post" title="Delete" className="p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty />}
            {isHr && (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-xs font-medium text-navy-700">+ Add {kind === "accolade" ? "an accolade" : kind === "news" ? "news" : "a quote"}</summary>
                <ActionForm action={addHrPost} className="mt-2 space-y-2">
                  <input type="hidden" name="kind" value={kind} />
                  {kind === "accolade" && (
                    <select name="employeeId" required className="input h-8 text-xs" aria-label="Employee">
                      <option value="">Who is it for?</option>
                      {staff.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </select>
                  )}
                  <input name="title" required className="input h-8 text-xs" placeholder={kind === "accolade" ? "e.g. Top closer of October" : kind === "news" ? "Headline" : "Quote"} aria-label="Title" />
                  {kind !== "wisdom" ? <textarea name="body" rows={2} className="input text-xs" placeholder="Details (optional)" aria-label="Details" /> : <input name="body" className="input h-8 text-xs" placeholder="Author (optional)" aria-label="Author" />}
                  <SubmitButton variant="secondary" className="h-8 text-xs">Post</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Widget>
        ))}
      </div>
      </>)}

      {show("summary") && (<>
      {mine && (
        <>
          <Widget title="Attendance Summary" className="mb-6" action={<span className="text-xs text-muted">{format(now, "MMMM yyyy")}</span>}>
            <DrillTiles className="lg:grid-cols-4 xl:grid-cols-4" tiles={[
              { key: "s", label: "Shifts", tone: "green", value: mine.summary.shifts, href: "/me/attendance" },
              { key: "e", label: "Expected Minutes", tone: "orange", value: mine.summary.expected.toLocaleString("en-PK"), sub: fmtMinutes(mine.summary.expected), href: "/me/attendance" },
              { key: "w", label: "Worked Minutes", tone: "violet", value: mine.summary.worked.toLocaleString("en-PK"), sub: fmtMinutes(mine.summary.worked), href: "/me/attendance" },
              { key: "sh", label: "Short Minutes", tone: "teal", value: mine.summary.short.toLocaleString("en-PK"), sub: fmtMinutes(mine.summary.short), href: "/me/attendance" },
            ]} />
          </Widget>
          <Widget title="My Check In Trends" className="mb-6" action={<span className="text-xs text-muted">Last 30 days</span>}>
            <LineChart labels={mine.trend.labels} series={[{ name: "Check-in time", color: "#ea580c", values: mine.trend.values }]} area={false}
              min={Math.max(0, Math.min(...mine.trend.values) - 30)}
              format={(v) => format(new Date(2000, 0, 1, Math.floor(v / 60), v % 60), "h:mm a")} empty="No check-ins in the last 30 days." />
          </Widget>
        </>
      )}
      </>)}

      {show("absents") && (<>
      <Widget title="Month Wise Absents" className="mb-6" action={<span className="text-xs text-muted">{company.monthAbsents.labels[0]} – {company.monthAbsents.labels.at(-1)}</span>}>
        <LineChart labels={company.monthAbsents.labels} series={[{ name: "Absents", color: "#ea580c", values: company.monthAbsents.values }]} />
      </Widget>
      </>)}

      {show("people") && (<>
      <Grid>
        <Widget title="Birthday" icon={<Cake className="size-4 text-pink-500" />}>
          {company.birthdays.length ? (
            <ul className="divide-y divide-line">
              {company.birthdays.map(({ e, on }) => <PersonRow key={e.id} e={e} sub={e.designation?.name} value={isToday(on) ? "Today 🎉" : format(on, "MMMM d")} />)}
            </ul>
          ) : <Empty />}
        </Widget>
        <Widget title="My Team" icon={<Users className="size-4 text-navy-700" />}>
          {mine?.team.length ? (
            <ul className="divide-y divide-line">
              {mine.team.map((t) => (
                <PersonRow key={t.id} e={t} sub={t.designation?.name}
                  value={t.today ? <span className={cn("rounded-full px-2 py-0.5 text-xs", color(DAY_STATUSES[t.today.status].color).pill)}>{DAY_STATUSES[t.today.status].label}</span> : "—"} />
              ))}
            </ul>
          ) : <Empty />}
        </Widget>
      </Grid>

      <Grid>
        <Widget title="New Joiners" icon={<UserPlus className="size-4 text-emerald-600" />}>
          {company.joiners.length ? (
            <ul className="divide-y divide-line">{company.joiners.map((e) => <PersonRow key={e.id} e={e} sub={e.designation?.name} value={format(e.joiningDate, "d MMM")} />)}</ul>
          ) : <Empty />}
        </Widget>
        <Widget title="Upcoming Work Anniversary" icon={<Gift className="size-4 text-gold-600" />}>
          {company.anniversaries.length ? (
            <ul className="divide-y divide-line">{company.anniversaries.map(({ e, on, years }) => <PersonRow key={e.id} e={e} sub={`${years} year${years === 1 ? "" : "s"}`} value={format(on, "MMMM d")} />)}</ul>
          ) : <Empty />}
        </Widget>
      </Grid>
      </>)}

      {show("headcount") && (<>
      <Grid>
        <Widget title="Head Count By Age"><BarList rows={h.age} empty="No Record Found!" /></Widget>
        <Widget title="Head Count By Branch"><BarList rows={h.branch} empty="No Record Found!" /></Widget>
      </Grid>
      <Grid>
        <Widget title="Head Count By Department"><BarList rows={h.department} empty="No Record Found!" /></Widget>
        <Widget title="Head Count By Designation"><BarList rows={h.designation} empty="No Record Found!" /></Widget>
      </Grid>
      <Grid>
        <Widget title="Head Count By Employment Type"><BarList rows={h.type} empty="No Record Found!" /></Widget>
        <Widget title="Head Count By Location"><BarList rows={h.location} empty="No Record Found!" /></Widget>
      </Grid>
      </>)}
      {show("money") && (<>
      <Grid>
        <Widget title="Head Count By Service"><BarList rows={h.service} empty="No Record Found!" /></Widget>
        <Widget title="Attrition By Separation Type" action={<span className="text-xs text-muted">Last 12 months</span>}>{h.attrition.length ? <BarList rows={h.attrition} /> : <Empty />}</Widget>
      </Grid>
      <Grid>
        <Widget title="Expense Report" action={<span className="text-xs text-muted">{format(now, "MMMM yyyy")}</span>}>{company.expenseRows.length ? <BarList rows={company.expenseRows} /> : <Empty />}</Widget>
        <Widget title="Monthly Attendance Report" action={<span className="text-xs text-muted">{format(now, "MMMM yyyy")}</span>}>
          <LineChart labels={company.monthly.labels} series={[
            { name: "Leaves", color: "#f59e0b", values: company.monthly.leaves },
            { name: "Absents", color: "#ef4444", values: company.monthly.absents },
            { name: "Presents", color: "#10b981", values: company.monthly.presents },
          ]} />
        </Widget>
      </Grid>
      </>)}
      {show("gender") && (<>
      <Grid>
        <Widget title="Gender Wise Head Count"><BarList rows={h.gender} empty="No Record Found!" /></Widget>
        <Widget title="Company Documents and Policies" action={<Link href={mine ? "/me/policies" : "/hr/policies"} className="text-xs text-navy-700 hover:underline">View all</Link>}>
          {policies.length ? (
            <ul className="divide-y divide-line">
              {policies.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <FileCheck2 className="size-4 shrink-0 text-navy-700" />
                  <Link href={mine ? `/me/policies?open=${p.id}` : `/hr/policies/${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:underline">{p.title}</span>
                    <span className="block text-xs text-muted">{p.category} · v{p.version}</span>
                  </Link>
                  {mine && p.requireAck && (p.ackAt ? <span className="text-xs text-emerald-600">Acknowledged</span> : <span className="text-xs font-medium text-amber-600">Please read</span>)}
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </Widget>
      </Grid>
      </>)}
      {show("support") && (<>
      <Grid>
        <Widget title="Support Email" icon={<Mail className="size-4 text-navy-700" />}>
          <ActionForm action={sendHrSupport} className="space-y-2">
            <input name="subject" required className="input h-9" placeholder="Subject" aria-label="Subject" />
            <textarea name="message" required rows={4} className="input" placeholder="Enter your message here" aria-label="Message" />
            <SubmitButton variant="secondary">Send to HR</SubmitButton>
          </ActionForm>
        </Widget>
        <Widget title="New Joiners By Gender" action={<span className="text-xs text-muted">Last 90 days</span>}>{h.joinersGender.length ? <BarList rows={h.joinersGender} /> : <Empty />}</Widget>
      </Grid>
      </>)}
    </>
  );
}

function Widget({ title, icon, action, className, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {icon}
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>;
}

function Empty({ text = "No Record Found!" }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-xs text-muted">
      <FileWarning className="size-9 opacity-40" />
      {text}
    </div>
  );
}

function Kpi({ tone, value, label, href }: { tone: string; value: number; label: string; href: string }) {
  return (
    <Link href={href} className={cn("group flex items-center gap-3 rounded-xl bg-gradient-to-br p-4 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", tone)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-white/15 text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-sm font-medium leading-tight">{label}</span>
    </Link>
  );
}

function PersonRow({ e, sub, value }: { e: { id: string; fullName: string; photo: string | null }; sub?: string | null; value: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <PersonAvatar name={e.fullName} photo={e.photo} />
      <Link href={`/hr/employees/${e.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium hover:underline">{e.fullName}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </Link>
      <span className="shrink-0 text-xs text-muted">{value}</span>
    </li>
  );
}

function PeopleList({ title, icon, action, rows }: {
  title: string; icon: React.ReactNode; action?: React.ReactNode;
  rows: { e: { id: string; fullName: string; photo: string | null }; value: string; sub: string; tone?: string }[];
}) {
  return (
    <Widget title={title} icon={icon} action={action}>
      {rows.length === 0 ? <Empty /> : (
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
    </Widget>
  );
}
