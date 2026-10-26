import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, CalendarClock, CalendarX, Clock, PhoneOff, XCircle } from "lucide-react";
import { fmtPhone, telHref } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui";
import { StatusPill } from "./bits";
import type { followUpLists } from "@/lib/agent-reports";

type Lists = Awaited<ReturnType<typeof followUpLists>>;
type LeadRow = Lists["neverContacted"][number];

/** The lead lists behind follow-up numbers: what to call, what is overdue, what has nothing planned. */
export function FollowUpLists({ lists, showOwner, only }: { lists: Lists; showOwner: boolean; only?: string }) {
  const sections: { key: string; title: string; hint: string; icon: typeof Clock; tone: string; rows: React.ReactNode[] }[] = [
    {
      key: "overdue", title: "Overdue follow-ups", hint: "Planned calls and tasks whose time has passed.", icon: AlertTriangle, tone: "text-red-600 bg-red-50",
      rows: lists.overdue.map((a) => a.lead && <Row key={a.id} lead={a.lead} showOwner={showOwner} detail={<span className="text-red-600">{a.subject} · due {formatDistanceToNowStrict(a.dueAt!, { addSuffix: true })}</span>} />),
    },
    {
      key: "today", title: "Due today", hint: "Planned for today.", icon: CalendarClock, tone: "text-gold-700 bg-gold-100",
      rows: lists.dueToday.map((a) => a.lead && <Row key={a.id} lead={a.lead} showOwner={showOwner} detail={<span>{a.subject} · {format(a.dueAt!, "h:mm a")}</span>} />),
    },
    {
      key: "never", title: "Not contacted yet", hint: "Open leads with no call, meeting, visit or email logged.", icon: PhoneOff, tone: "text-red-600 bg-red-50",
      rows: lists.neverContacted.map((l) => <Row key={l.id} lead={l} showOwner={showOwner} detail={<span>Came in {formatDistanceToNowStrict(l.createdAt, { addSuffix: true })}</span>} />),
    },
    {
      key: "noplan", title: "No follow-up planned", hint: "Open leads with nothing scheduled. Plan the next step.", icon: CalendarX, tone: "text-amber-700 bg-amber-50",
      rows: lists.noNextStep.map((l) => <Row key={l.id} lead={l} showOwner={showOwner} detail={<span>Last activity {l.lastActivityAt ? formatDistanceToNowStrict(l.lastActivityAt, { addSuffix: true }) : "never"}</span>} />),
    },
    {
      key: "stale", title: "Not contacted for 7+ days", hint: "Open leads going cold.", icon: Clock, tone: "text-amber-700 bg-amber-50",
      rows: lists.stale.map((l) => <Row key={l.id} lead={l} showOwner={showOwner} detail={<span>Last activity {formatDistanceToNowStrict(l.lastActivityAt ?? l.createdAt, { addSuffix: true })}</span>} />),
    },
    ...(lists.closedNoContact.length ? [{
      key: "closed", title: "Closed without any contact", hint: "Marked Not Interested / Not Valid without a single call, meeting or email logged.", icon: XCircle, tone: "text-red-600 bg-red-50",
      rows: lists.closedNoContact.map((l) => <Row key={l.id} lead={l} showOwner={showOwner} detail={<span>Closed {format(l.updatedAt, "d MMM")}</span>} />),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      {sections.filter((s) => !only || s.key === only).map((s) => (
        <Card key={s.key} className="overflow-hidden" id={s.key}>
          <div className="flex items-center gap-3 border-b border-line px-5 py-3">
            <span className={cn("flex size-8 items-center justify-center rounded-lg", s.tone)}><s.icon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">{s.title} <span className="text-muted">{s.rows.length}{s.rows.length === 200 ? "+" : ""}</span></h2>
              <p className="text-xs text-muted">{s.hint}</p>
            </div>
          </div>
          {s.rows.length === 0 ? <p className="px-5 py-4 text-sm text-emerald-700">All clear.</p> : <ul className="divide-y divide-line">{s.rows}</ul>}
        </Card>
      ))}
    </div>
  );
}

function Row({ lead, detail, showOwner }: { lead: LeadRow; detail: React.ReactNode; showOwner: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
      <span className="min-w-0 flex-1">
        <Link href={`/crm/leads/${lead.id}`} className="font-medium text-navy-900 hover:underline">{lead.name}</Link>
        {lead.number && <span className="ml-1.5 text-xs text-muted">#{lead.number}</span>}
        <span className="block truncate text-xs text-muted">{detail}{lead.source ? ` · ${lead.source.name}` : ""}{showOwner && lead.owner ? ` · ${lead.owner.name}` : ""}</span>
      </span>
      <StatusPill name={lead.status.name} colorName={lead.status.color} />
      {lead.phone && <a href={telHref(lead.phone)} className="whitespace-nowrap text-muted hover:text-navy-900 hover:underline">{fmtPhone(lead.phone)}</a>}
      <Link href={`/crm/leads/${lead.id}#composer`} className="text-xs font-medium text-navy-900 hover:underline">Plan next step</Link>
    </li>
  );
}
