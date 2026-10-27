import Link from "next/link";
import { format, isToday, startOfDay, startOfMonth } from "date-fns";
import { CalendarPlus, ClipboardCheck, FileCheck2, HeartHandshake, MessageSquarePlus, Palmtree, Receipt, User, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DAY_STATUSES, geofenceMode, loadAttendance, summarize } from "@/lib/attendance";
import { balancesFor } from "@/lib/leave";
import { policiesFor } from "@/lib/policies";
import { respondentKey } from "@/lib/engagement";
import { color, fmtPKR } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { CheckInButton } from "../attendance/check-in-button";

export const metadata = { title: "My Space" };

/** Employee home: check in, my numbers at a glance, quick actions and company news. Built for phones first. */
export default async function MyHome() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, include: { branch: true, shift: true } });
  if (!emp) return (<><PageHeader title="My Space" /><Card><EmptyState title="Your login isn't linked to an employee record" description="Ask HR to link it to see attendance, leave and payslips." /></Card></>);

  const now = new Date();
  const [att, punches, balances, slip, pendingReqs, policies, surveys, posts, mode] = await Promise.all([
    loadAttendance([emp.id], startOfMonth(now), now),
    db.attendancePunch.findMany({ where: { employeeId: emp.id, at: { gte: startOfDay(now) } }, orderBy: { at: "asc" } }),
    balancesFor(emp.id).catch(() => []),
    db.payslip.findFirst({ where: { employeeId: emp.id, run: { status: { not: "draft" } } }, include: { run: { select: { month: true } } }, orderBy: { run: { month: "desc" } } }),
    db.approvalRequest.count({ where: { requesterId: user.id, status: "pending" } }),
    policiesFor(emp.id),
    db.engagementSurvey.findMany({ where: { status: "open", OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }] }, select: { id: true } }),
    db.hrPost.findMany({ orderBy: { createdAt: "desc" }, take: 4 }),
    geofenceMode(),
  ]);
  const days = att.get(emp.id) ?? [];
  const today = days.find((d) => isToday(d.date));
  const month = summarize(days.filter((d) => d.date <= now));
  const annual = balances.find((b) => !b.unlimited && b.type.paid);
  const toAck = policies.filter((p) => p.requireAck && !p.ackAt).length;
  const answered = await db.engagementResponse.count({ where: { respondentKey: { in: surveys.map((x) => respondentKey(x.id, emp.id)) } } });
  const openSurveys = surveys.length - answered;
  const hour = now.getHours();

  const tiles = [
    { href: "/me/leave", icon: Palmtree, label: "Leave left", value: annual ? `${annual.available}` : "—", sub: annual?.type.name, tone: "text-emerald-600" },
    { href: "/me/payslips", icon: Wallet, label: "Last payslip", value: slip ? fmtPKR(slip.net) : "—", sub: slip ? format(new Date(`${slip.run.month}-01`), "MMMM") : "none yet", tone: "text-navy-900" },
    { href: "/me/attendance", icon: ClipboardCheck, label: "This month", value: `${month.present}`, sub: `present · ${month.late} late · ${month.absent} absent`, tone: "text-sky-600" },
    { href: "/approvals?tab=mine", icon: MessageSquarePlus, label: "My requests", value: `${pendingReqs}`, sub: "waiting for approval", tone: "text-amber-600" },
  ];
  const actions = [
    { href: "/me/leave", icon: CalendarPlus, label: "Apply leave" },
    { href: "/hr/requests", icon: MessageSquarePlus, label: "New request" },
    { href: "/me/expenses", icon: Receipt, label: "Expense claim" },
    { href: "/me", icon: User, label: "My profile" },
    { href: "/me/policies", icon: FileCheck2, label: "Policies", badge: toAck },
    { href: "/me/surveys", icon: HeartHandshake, label: "Surveys", badge: openSurveys },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-4">
        <PersonAvatar name={emp.fullName} photo={emp.photo} className="size-14 text-lg" />
        <div>
          <p className="text-sm text-muted">{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"},</p>
          <h1 className="font-display text-2xl font-semibold">{emp.firstName ?? emp.fullName.split(" ")[0]}</h1>
        </div>
      </div>

      <Card className="mb-5 overflow-hidden">
        <div className="border-t-4 border-gold-400 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{format(now, "EEEE d MMMM")}</p>
              <p className="font-display text-3xl font-semibold">{format(now, "h:mm a")}</p>
            </div>
            {today && today.status !== "upcoming" && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", color(DAY_STATUSES[today.status].color).pill)}>{DAY_STATUSES[today.status].label}</span>}
          </div>
          <CheckInButton checkedIn={punches.length % 2 === 1} needsLocation={mode !== "off" && emp.branch?.lat != null} />
          <p className="mt-3 text-center text-xs text-muted">
            {emp.shift ? `Shift ${emp.shift.start}–${emp.shift.end}` : ""}{punches.length ? ` · ${punches.map((p, i) => `${i % 2 ? "out" : "in"} ${format(p.at, "h:mm a")}`).join(" · ")}` : ""}
          </p>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <t.icon className="mb-2 size-5 text-muted" />
              <p className="text-xs text-muted">{t.label}</p>
              <p className={cn("text-xl font-semibold tabular-nums", t.tone)}>{t.value}</p>
              {t.sub && <p className="truncate text-xs text-muted">{t.sub}</p>}
            </Card>
          </Link>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {actions.map((a) => (
          <Link key={a.label} href={a.href} className="relative flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface p-3 text-center text-xs font-medium transition hover:bg-canvas">
            <a.icon className="size-5 text-navy-700" />
            {a.label}
            {!!a.badge && <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">{a.badge}</span>}
          </Link>
        ))}
      </div>

      {posts.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">From HR</h2>
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id} className="text-sm">
                <p className={cn("font-medium", p.kind === "wisdom" && "italic")}>{p.kind === "accolade" ? "🏆 " : p.kind === "news" ? "📰 " : "💬 "}{p.title}</p>
                {p.body && <p className="text-xs text-muted">{p.body}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
