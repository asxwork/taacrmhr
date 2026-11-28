import Link from "@/components/link";
import { format, isToday, startOfDay, startOfMonth } from "date-fns";
import { CalendarPlus, ClipboardCheck, FileCheck2, HeartHandshake, MessageSquarePlus, Palmtree, Receipt, User, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DAY_STATUSES, geofenceMode, selfieMode, loadAttendance, summarize } from "@/lib/attendance";
import { balancesFor } from "@/lib/leave";
import { policiesFor } from "@/lib/policies";
import { respondentKey } from "@/lib/engagement";
import { color, fmtPKR } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FeedIcon } from "@/components/feed-icon";
import { PersonAvatar } from "@/components/person-avatar";
import { CheckInButton } from "../attendance/check-in-button";
import { SendWish } from "@/components/send-wish";
import { disabledFeatures } from "@/lib/features";
import { addDays, differenceInCalendarDays, setYear } from "date-fns";

export const metadata = { title: "My Space" };

/** Employee home: check in, my numbers at a glance, quick actions and company news. Built for phones first. */
export default async function MyHome() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, include: { branch: true, shift: true } });
  if (!emp) return (<><PageHeader title="My Space" /><Card><EmptyState title="Your login isn't linked to an employee record" description="Ask HR to link it to see attendance, leave and payslips." /></Card></>);

  const now = new Date();
  const [att, punches, balances, slip, pendingReqs, policies, surveys, posts, mode, selfie] = await Promise.all([
    loadAttendance([emp.id], startOfMonth(now), now),
    db.attendancePunch.findMany({ where: { employeeId: emp.id, at: { gte: startOfDay(now) } }, orderBy: { at: "asc" } }),
    balancesFor(emp.id).catch(() => []),
    db.payslip.findFirst({ where: { employeeId: emp.id, run: { status: { not: "draft" } } }, include: { run: { select: { month: true } } }, orderBy: { run: { month: "desc" } } }),
    db.approvalRequest.count({ where: { requesterId: user.id, status: "pending" } }),
    policiesFor(emp.id),
    db.engagementSurvey.findMany({ where: { status: "open", OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }] }, select: { id: true } }),
    db.hrPost.findMany({ orderBy: { createdAt: "desc" }, take: 4 }),
    geofenceMode(),
    selfieMode(),
  ]);
  // Celebrations (next 7 days) and this month's kudos leaderboard.
  const off = await disabledFeatures();
  const nextYearly = (d: Date) => { let n = setYear(startOfDay(d), now.getFullYear()); if (n < startOfDay(now)) n = setYear(startOfDay(d), now.getFullYear() + 1); return n; };
  const people = off.has("celebrations") ? [] : await db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, photo: true, dob: true, joiningDate: true, userId: true } });
  const soon = (d: Date) => differenceInCalendarDays(nextYearly(d), now) <= 6;
  const celebrations = [
    ...people.filter((p) => p.dob && soon(p.dob)).map((p) => ({ p, on: nextYearly(p.dob!), what: "Birthday 🎂", wish: "Happy birthday! 🎂 Wishing you a wonderful year ahead." })),
    ...people.filter((p) => soon(p.joiningDate) && nextYearly(p.joiningDate).getFullYear() - p.joiningDate.getFullYear() > 0).map((p) => { const y = nextYearly(p.joiningDate).getFullYear() - p.joiningDate.getFullYear(); return { p, on: nextYearly(p.joiningDate), what: `${y} year${y === 1 ? "" : "s"} with us 🎉`, wish: `Happy ${y}-year work anniversary! 🎉 Thank you for everything.` }; }),
  ].sort((a, b) => +a.on - +b.on).slice(0, 8);
  const kudos = off.has("feed") || off.has("kudos-board") ? [] : await db.feedPost.groupBy({ by: ["employeeId"], where: { kind: "kudos", createdAt: { gte: startOfMonth(now) }, employeeId: { not: null } }, _count: { _all: true }, orderBy: { _count: { employeeId: "desc" } }, take: 5 });
  const kudosNames = new Map((await db.employee.findMany({ where: { id: { in: kudos.map((k) => k.employeeId!) } }, select: { id: true, fullName: true, photo: true } })).map((e) => [e.id, e]));
  const toSign = (await db.employeeLetter.count({ where: { employeeId: emp.id, requireSign: true, signedAt: null } })) + (await db.employeeDocument.count({ where: { employeeId: emp.id, requireSign: true, signedAt: null } }));
  const toConfirm = off.has("feed") || off.has("feed-receipts") ? 0 : await (async () => {
    const posts = await db.feedPost.findMany({ where: { AND: [await (await import("@/lib/feed")).feedWhere(user.id), { requireAck: true, authorId: { not: user.id } }] }, select: { id: true }, take: 50 });
    const acked = await db.feedRead.count({ where: { userId: user.id, postId: { in: posts.map((p) => p.id) }, ackedAt: { not: null } } });
    return posts.length - acked;
  })();
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
    { href: off.has("me-requests") ? "/approvals?tab=mine" : "/me/requests", icon: MessageSquarePlus, label: "My requests", value: `${pendingReqs}`, sub: "waiting for approval", tone: "text-amber-600" },
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
        <div className="ml-auto"><FeedIcon /></div>
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
          <CheckInButton checkedIn={punches.length % 2 === 1} needsLocation={mode !== "off" && emp.branch?.lat != null} selfie={selfie} />
          <p className="mt-3 text-center text-xs text-muted">
            {emp.shift ? `Shift ${emp.shift.start}–${emp.shift.end}` : ""}{punches.length ? ` · ${punches.map((p, i) => `${i % 2 ? "out" : "in"} ${format(p.at, "h:mm a")}`).join(" · ")}` : ""}
          </p>
        </div>
      </Card>

      {toConfirm > 0 && (
        <Link href="/feed" className="mb-3 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 hover:bg-sky-100">
          <span className="text-lg">📢</span><span className="flex-1"><b className="font-medium">{toConfirm} announcement{toConfirm === 1 ? "" : "s"} to read and confirm</b><span className="block text-xs">Open the feed and press Got it</span></span><span className="text-xs font-medium">Read →</span>
        </Link>
      )}
      {toSign > 0 && (
        <Link href="/me/documents" className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100">
          <FileCheck2 className="size-5" /><span className="flex-1"><b className="font-medium">{toSign} document{toSign === 1 ? "" : "s"} waiting for your signature</b><span className="block text-xs">Read and sign in My Documents</span></span><span className="text-xs font-medium">Sign →</span>
        </Link>
      )}

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

      {(celebrations.length > 0 || kudos.length > 0) && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {celebrations.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Celebrations this week</h2>
              <ul className="space-y-2">
                {celebrations.map(({ p, on, what, wish }) => (
                  <li key={p.id + what} className="flex items-center gap-2 text-sm">
                    <PersonAvatar name={p.fullName} photo={p.photo} className="size-8" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.fullName}</span><span className="block text-xs text-muted">{what} · {differenceInCalendarDays(on, now) === 0 ? "today" : differenceInCalendarDays(on, now) === 1 ? "tomorrow" : format(on, "EEE d MMM")}</span></span>
                    {p.userId !== user.id && !off.has("feed") && differenceInCalendarDays(on, now) <= 0 && <SendWish employeeId={p.id} text={wish} />}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {kudos.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Kudos leaderboard · {format(now, "MMMM")}</h2>
              <ol className="space-y-2">
                {kudos.map((k, i) => { const e = kudosNames.get(k.employeeId!); return e ? (
                  <li key={k.employeeId} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-center">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                    <PersonAvatar name={e.fullName} photo={e.photo} className="size-8" />
                    <span className="flex-1 truncate font-medium">{e.fullName}{e.id === emp.id && " (you)"}</span>
                    <span className="text-xs text-muted">{k._count._all} kudos</span>
                  </li>
                ) : null; })}
              </ol>
              <Link href="/feed" className="mt-2 inline-block text-xs text-navy-900 hover:underline">Give kudos →</Link>
            </Card>
          )}
        </div>
      )}

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
