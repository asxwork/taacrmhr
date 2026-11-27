import Link from "@/components/link";
import { addDays, format, startOfDay } from "date-fns";
import { AlarmClock, Building2, CheckCircle2, Flame, MessageCircle, Phone, PhoneCall, Sparkles, Target } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { fieldAccess } from "@/lib/field-rules";
import { maskPhone } from "@/lib/field-defs";
import { fmtPhone, telHref, waHref } from "@/lib/crm-shared";
import { leadScoreParts } from "@/lib/lead-score";
import { sourceRates } from "@/lib/lead-score-data";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "My day" };

/** The agent's day on one screen: what's overdue and due today, callbacks, site visits, new leads, hot leads without a next step. */
export default async function MyDay() {
  const user = await requirePermission("crm.leads");
  const now = new Date(), today = startOfDay(now), tomorrow = addDays(today, 1);
  const fields = await fieldAccess(user);
  const showPhone = (p: string | null) => (!p ? null : fields["lead.phone"] === "hidden" ? null : fields["lead.phone"] === "mask" ? maskPhone(p) : fmtPhone(p));
  const leadSel = { id: true, name: true, phone: true, status: { select: { name: true, kind: true } } } as const;
  const [acts, doneToday, callbacks, newLeads, openStatuses, myOpen, allOpen] = await Promise.all([
    db.activity.findMany({ where: { ownerId: user.id, doneAt: null, dueAt: { lt: tomorrow } }, include: { lead: { select: leadSel } }, orderBy: { dueAt: "asc" }, take: 80 }),
    db.activity.count({ where: { ownerId: user.id, doneAt: { gte: today } } }),
    db.callTarget.findMany({ where: { assigneeId: user.id, status: "callback", callbackAt: { lt: tomorrow } }, orderBy: { callbackAt: "asc" }, take: 30 }),
    db.lead.findMany({ where: { ownerId: user.id, createdAt: { gte: addDays(now, -1) }, status: { kind: "open" } }, select: { ...leadSel, createdAt: true, source: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.leadStatus.findMany({ where: { active: true, kind: "open" }, orderBy: { sortOrder: "asc" }, select: { id: true } }),
    db.lead.findMany({ where: { ownerId: user.id, status: { kind: "open" }, activities: { none: { doneAt: null, dueAt: { not: null } } } }, select: { ...leadSel, statusId: true, createdAt: true, lastActivityAt: true, budgetMin: true, budgetMax: true, projectId: true, unitId: true, sourceId: true, email: true }, take: 300 }),
    db.lead.findMany({ where: { ownerId: user.id, status: { kind: "open" } }, select: { ...leadSel, statusId: true, createdAt: true, lastActivityAt: true, budgetMin: true, budgetMax: true, projectId: true, unitId: true, sourceId: true, email: true }, orderBy: { lastActivityAt: "desc" }, take: 600 }),
  ]);
  const visits = acts.filter((a) => a.type === "visit");
  const overdue = acts.filter((a) => a.type !== "visit" && a.dueAt! < today);
  const dueToday = acts.filter((a) => a.type !== "visit" && a.dueAt! >= today);
  const rates = await sourceRates();
  const openIds = openStatuses.map((s) => s.id);
  const hot = myOpen.map((l) => ({ l, s: leadScoreParts({ kind: "open", stageIndex: Math.max(0, openIds.indexOf(l.statusId)), stageCount: openIds.length, createdAt: l.createdAt, lastActivityAt: l.lastActivityAt, hasBudget: !!(l.budgetMin || l.budgetMax), hasProperty: !!(l.projectId || l.unitId), nextDue: null, sourceRate: l.sourceId ? rates.get(l.sourceId) ?? null : null, fullContact: !!(l.phone && l.email) }) }))
    .filter((x) => x.s.score >= 35).sort((a, b) => b.s.score - a.s.score).slice(0, 10);
  // Call these first: my best-scoring open leads not contacted yet today (planned follow-ups count as "next step").
  const nextByLead = new Map<string, Date>();
  for (const a of acts) if (a.lead && a.dueAt && !nextByLead.has(a.lead.id)) nextByLead.set(a.lead.id, a.dueAt);
  const first = allOpen
    .filter((l) => !l.lastActivityAt || l.lastActivityAt < today)
    .map((l) => ({ l, s: leadScoreParts({ kind: "open", stageIndex: Math.max(0, openIds.indexOf(l.statusId)), stageCount: openIds.length, createdAt: l.createdAt, lastActivityAt: l.lastActivityAt, hasBudget: !!(l.budgetMin || l.budgetMax), hasProperty: !!(l.projectId || l.unitId), nextDue: nextByLead.get(l.id) ?? null, sourceRate: l.sourceId ? rates.get(l.sourceId) ?? null : null, fullContact: !!(l.phone && l.email) }) }))
    .sort((a, b) => b.s.score - a.s.score).slice(0, 10);
  const todo = overdue.length + dueToday.length + visits.length + callbacks.length;
  const pct = todo + doneToday ? Math.round((doneToday / (todo + doneToday)) * 100) : 100;

  const Contact = ({ id, phone }: { id: string; phone: string | null }) => phone && fields["lead.phone"] !== "hidden" ? (
    <span className="flex shrink-0 gap-1">
      <a href={fields["lead.phone"] === "mask" ? `/api/leads/${id}/dial?via=tel` : telHref(phone)} title="Call" className="rounded-md p-1.5 text-navy-900 hover:bg-canvas"><Phone className="size-4" /></a>
      <a href={fields["lead.phone"] === "mask" ? `/api/leads/${id}/dial?via=wa` : waHref(phone)} target="_blank" rel="noreferrer" title="WhatsApp" className="rounded-md p-1.5 text-emerald-600 hover:bg-canvas"><MessageCircle className="size-4" /></a>
    </span>
  ) : null;
  const Section = ({ title, icon: Icon, tone, count, children, empty }: { title: string; icon: typeof Target; tone: string; count: number; children: React.ReactNode; empty: string }) => (
    <Card className="overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold"><span className={cn("flex size-7 items-center justify-center rounded-lg", tone)}><Icon className="size-4" /></span>{title}<span className="ml-auto rounded-full bg-canvas px-2 text-xs text-muted">{count}</span></h2>
      {count ? <ul className="divide-y divide-line">{children}</ul> : <p className="px-4 py-4 text-sm text-muted">{empty}</p>}
    </Card>
  );
  const ActRow = ({ a }: { a: (typeof acts)[number] }) => (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className={cn("w-16 shrink-0 text-xs", a.dueAt! < today ? "font-medium text-red-600" : "text-muted")}>{a.dueAt! < today ? format(a.dueAt!, "d MMM") : format(a.dueAt!, "h:mm a")}</span>
      <span className="min-w-0 flex-1">{a.lead ? <Link href={`/crm/leads/${a.lead.id}`} className="block truncate font-medium hover:underline">{a.lead.name}</Link> : null}<span className="block truncate text-xs text-muted">{a.subject}{a.lead && ` · ${a.lead.status.name}`}</span></span>
      {a.lead && <Contact id={a.lead.id} phone={a.lead.phone} />}
    </li>
  );

  return (
    <>
      <PageHeader title={`My day · ${format(now, "EEEE d MMMM")}`} description="Everything to do today in one place. Work from the top: overdue first." />
      <Card className="mb-6 flex flex-wrap items-center gap-5 p-5">
        <div className="relative size-16"><svg viewBox="0 0 36 36" className="size-16 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-canvas" /><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" strokeDasharray={`${pct} 100`} pathLength={100} strokeLinecap="round" className="stroke-emerald-500" /></svg><span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{pct}%</span></div>
        <div className="flex-1"><p className="font-semibold">{todo ? `${todo} things left for today` : "All done for today 🎉"}</p><p className="text-sm text-muted">{doneToday} done so far · {overdue.length} overdue · {visits.length} site visit{visits.length === 1 ? "" : "s"} · {callbacks.length} callback{callbacks.length === 1 ? "" : "s"}</p></div>
        <Link href="/crm/focus" className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas">Open Focus queue →</Link>
      </Card>
      <Card className="mb-6 overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold"><span className="flex size-7 items-center justify-center rounded-lg bg-red-50 text-red-600"><Target className="size-4" /></span>Call these first today<span className="ml-2 text-xs font-normal text-muted">your best leads you haven&apos;t spoken to today, by lead score</span></h2>
        {first.length ? (
          <ol className="divide-y divide-line">{first.map(({ l, s }, i) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 shrink-0 text-xs text-muted">{i + 1}</span>
              <span className={cn("w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold", s.score >= 60 ? "bg-red-50 text-red-700" : s.score >= 35 ? "bg-amber-50 text-amber-800" : "bg-canvas text-muted")}>{s.score}</span>
              <span className="min-w-0 flex-1"><Link href={`/crm/leads/${l.id}`} className="block truncate font-medium hover:underline">{l.name}</Link><span className="block truncate text-xs text-muted">{l.status.name}{s.why.length ? ` · ${s.why.slice(0, 3).join(" · ")}` : ""}</span></span>
              <Contact id={l.id} phone={l.phone} />
            </li>
          ))}</ol>
        ) : <p className="px-4 py-4 text-sm text-muted">You&apos;ve spoken to all your open leads today. 👍</p>}
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Overdue" icon={AlarmClock} tone="bg-red-50 text-red-600" count={overdue.length} empty="Nothing overdue. 👍">{overdue.map((a) => <ActRow key={a.id} a={a} />)}</Section>
        <Section title="Due today" icon={CheckCircle2} tone="bg-sky-50 text-sky-700" count={dueToday.length} empty="No follow-ups planned for today.">{dueToday.map((a) => <ActRow key={a.id} a={a} />)}</Section>
        <Section title="Site visits today" icon={Building2} tone="bg-violet-50 text-violet-700" count={visits.length} empty="No site visits today.">{visits.map((a) => <ActRow key={a.id} a={a} />)}</Section>
        <Section title="Callbacks" icon={PhoneCall} tone="bg-amber-50 text-amber-700" count={callbacks.length} empty="No callbacks due.">{callbacks.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5"><span className="w-16 shrink-0 text-xs text-muted">{c.callbackAt && (c.callbackAt < today ? format(c.callbackAt, "d MMM") : format(c.callbackAt, "h:mm a"))}</span><span className="min-w-0 flex-1"><Link href="/calls/callbacks" className="block truncate font-medium hover:underline">{c.name || fmtPhone(c.phone)}</Link><span className="block truncate text-xs text-muted">{c.notes || "Call back"}</span></span><a href={telHref(c.phone)} className="rounded-md p-1.5 text-navy-900 hover:bg-canvas" title="Call"><Phone className="size-4" /></a></li>
        ))}</Section>
        <Section title="New leads (last 24 hours)" icon={Sparkles} tone="bg-emerald-50 text-emerald-700" count={newLeads.length} empty="No new leads assigned to you.">{newLeads.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5"><span className="w-16 shrink-0 text-xs text-muted">{format(l.createdAt, "h:mm a")}</span><span className="min-w-0 flex-1"><Link href={`/crm/leads/${l.id}`} className="block truncate font-medium hover:underline">{l.name}</Link><span className="block truncate text-xs text-muted">{l.source?.name ?? "No source"} · {showPhone(l.phone) ?? ""}</span></span><Contact id={l.id} phone={l.phone} /></li>
        ))}</Section>
        <Section title="Hot leads with no next step" icon={Flame} tone="bg-orange-50 text-orange-600" count={hot.length} empty="Every hot lead has a next step planned.">{hot.map(({ l, s }) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5"><span title={s.why.join("\n")} className={cn("w-16 shrink-0 text-xs font-semibold", s.score >= 60 ? "text-red-600" : "text-amber-700")}>{s.score >= 60 ? "Hot" : "Warm"} {s.score}</span><span className="min-w-0 flex-1"><Link href={`/crm/leads/${l.id}`} className="block truncate font-medium hover:underline">{l.name}</Link><span className="block truncate text-xs text-muted">{l.status.name} · plan a follow-up</span></span><Contact id={l.id} phone={l.phone} /></li>
        ))}</Section>
      </div>
    </>
  );
}
