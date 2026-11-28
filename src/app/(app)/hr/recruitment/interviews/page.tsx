import Link from "@/components/link";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { CalendarClock, MapPin, Video, Phone } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { INTERVIEW_STATUS, modeLabel, scoreAvg } from "@/lib/interview-shared";
import { cn } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Interviews" };

/** Every interview by day with its time, candidate, job, interviewer and place; past ones still waiting for a scorecard. */
export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ mine?: string; days?: string }> }) {
  const user = await requirePermission("hr.recruitment");
  const sp = await searchParams;
  const mine = sp.mine === "1";
  const days = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const today = startOfDay(new Date());
  const who = mine ? { interviewerId: user.id } : {};
  const [upcoming, waiting] = await Promise.all([
    db.interview.findMany({ where: { ...who, at: { gte: today, lt: addDays(today, days) }, status: { not: "cancelled" } }, include: { candidate: { select: { id: true, name: true, phone: true, openingId: true, opening: { select: { title: true } } } } }, orderBy: { at: "asc" } }),
    db.interview.findMany({ where: { ...who, at: { lt: new Date() }, status: "scheduled" }, include: { candidate: { select: { id: true, name: true, openingId: true, opening: { select: { title: true } } } } }, orderBy: { at: "desc" }, take: 50 }),
  ]);
  const ids = [...new Set([...upcoming, ...waiting].map((i) => i.interviewerId).filter(Boolean))] as string[];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const byDay = new Map<string, typeof upcoming>();
  for (const i of upcoming) { const k = format(i.at, "yyyy-MM-dd"); byDay.set(k, [...(byDay.get(k) ?? []), i]); }
  const href = (o: { mine?: boolean; days?: number }) => `/hr/recruitment/interviews?${new URLSearchParams({ ...((o.mine ?? mine) ? { mine: "1" } : {}), days: String(o.days ?? days) })}`;
  const Icon = (m: string) => (m === "video" ? Video : m === "phone" ? Phone : MapPin);

  return (
    <>
      <PageHeader title="Interviews" description="Who's coming in, when and where. Times are Pakistan time; each interview shows its length, interviewer and place or video link." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={href({ mine: false })} className={cn("rounded-lg px-3 py-1.5", !mine ? "bg-navy-900 text-white" : "border border-line hover:bg-canvas")}>Everyone</Link>
        <Link href={href({ mine: true })} className={cn("rounded-lg px-3 py-1.5", mine ? "bg-navy-900 text-white" : "border border-line hover:bg-canvas")}>My interviews</Link>
        <span className="mx-2 border-l border-line" />
        {[7, 14, 30].map((n) => <Link key={n} href={href({ days: n })} className={cn("rounded-lg px-3 py-1.5", n === days ? "bg-canvas font-medium" : "text-muted hover:text-ink")}>Next {n} days</Link>)}
      </div>
      {waiting.length > 0 && (
        <Card className="mb-4 border-amber-200 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-800">Waiting for a scorecard ({waiting.length})</h2>
          <ul className="divide-y divide-line text-sm">
            {waiting.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                <span className="w-32 text-xs text-muted">{format(i.at, "EEE d MMM, h:mm a")}</span>
                <Link href={`/hr/recruitment/${i.candidate.openingId}?c=${i.candidate.id}`} className="font-medium hover:underline">{i.candidate.name}</Link>
                <span className="text-xs text-muted">{i.candidate.opening.title} · {names.get(i.interviewerId ?? "") ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {upcoming.length === 0 ? <EmptyState title="No interviews coming up" description="Schedule one from a candidate in Recruitment." /> : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([k, list]) => {
            const day = new Date(`${k}T12:00:00`);
            return (
              <Card key={k} className="overflow-hidden">
                <h2 className={cn("flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold", isSameDay(day, today) && "bg-navy-900 text-white")}><CalendarClock className="size-4" />{isSameDay(day, today) ? "Today · " : isSameDay(day, addDays(today, 1)) ? "Tomorrow · " : ""}{format(day, "EEEE d MMMM")}<span className="ml-auto text-xs font-normal opacity-70">{list.length} interview{list.length === 1 ? "" : "s"}</span></h2>
                <ul className="divide-y divide-line">
                  {list.map((i) => {
                    const M = Icon(i.mode), st = INTERVIEW_STATUS[i.status] ?? INTERVIEW_STATUS.scheduled!, avg = scoreAvg(i.scorecard);
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                        <span className="w-36 shrink-0 text-sm font-semibold tabular-nums">{format(i.at, "h:mm a")} – {format(new Date(+i.at + i.durationMin * 60_000), "h:mm a")}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/hr/recruitment/${i.candidate.openingId}?c=${i.candidate.id}`} className="font-medium hover:underline">{i.candidate.name}</Link>
                          <span className="block text-xs text-muted">{i.candidate.opening.title} · with {names.get(i.interviewerId ?? "") ?? "—"}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted"><M className="size-3.5" />{i.mode === "video" && i.meetingLink ? <a href={i.meetingLink} target="_blank" rel="noreferrer" className="text-navy-900 underline">Join video call</a> : i.location ?? modeLabel(i.mode)}</span>
                        {i.status !== "scheduled" && <Badge tone={st.tone}>{st.label}</Badge>}
                        {avg != null && <Badge tone={avg >= 4 ? "green" : avg >= 3 ? "amber" : "red"}>★ {avg}</Badge>}
                        {i.invitedAt && <span className="text-[11px] text-emerald-700">invited</span>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
