import type { DaySummary } from "@/lib/call-daily";
import { ColumnChart, BarList } from "@/components/charts";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

/** Calls by hour, trimmed to the hours that had calls (plus one either side). */
export function HourChart({ hours }: { hours: number[] }) {
  const used = hours.map((n, h) => (n ? h : -1)).filter((h) => h >= 0);
  if (!used.length) return <p className="py-6 text-center text-sm text-muted">No calls yet.</p>;
  const from = Math.max(0, Math.min(...used) - 1), to = Math.min(23, Math.max(...used) + 1);
  const data = hours.slice(from, to + 1).map((value, i) => ({ label: `${h12(from + i)}–${h12(from + i + 1)}`, short: h12(from + i), value }));
  return <ColumnChart data={data} unit="calls" />;
}

/** Numbers row + hourly chart + outcomes + campaigns for one agent's day. */
export function DayReport({ s, compact = false }: { s: DaySummary; compact?: boolean }) {
  const stats: [string, string | number, string?][] = [
    ["Calls", s.calls], ["Reached", s.reached, `${s.reachPct}%`], ["Interested", s.interested], ["Callbacks", s.callbacks],
    ["Talk time", `${s.talkMin} min`], ["Avg call", s.avgSec ? mmss(s.avgSec) : "—"],
    ["First – last", s.first ? `${s.first}–${s.last}` : "—"], ["Longest break", s.calls > 1 ? `${s.longestGapMin} min` : "—"],
  ];
  return (
    <div className="space-y-5">
      <dl className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
        {stats.map(([k, v, sub]) => (
          <div key={k} className="rounded-xl bg-canvas px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{v}{sub && <span className="ml-1.5 text-xs font-normal text-muted">{sub}</span>}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Calls by hour</p>
        <HourChart hours={s.hours} />
      </div>
      {!compact && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Outcomes</p><BarList rows={s.outcomes.map((o) => ({ name: o.label, value: o.n, display: String(o.n) }))} empty="No calls." /></div>
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Campaigns</p><BarList rows={s.campaigns.map((c) => ({ name: c.name, value: c.n, display: `${c.n} calls` }))} empty="No campaign calls." /></div>
        </div>
      )}
      {!compact && (s.notAnswered + s.wrong + s.whatsapp + s.inbound + s.missed + s.leads > 0) && (
        <p className="text-sm text-muted">Not answered / busy / off: <b className="text-ink">{s.notAnswered}</b> · Wrong numbers: <b className="text-ink">{s.wrong}</b> · WhatsApp sent: <b className="text-ink">{s.whatsapp}</b> · Inbound answered: <b className="text-ink">{s.inbound}</b> · Missed: <b className="text-ink">{s.missed}</b> · Leads sent to CRM: <b className="text-ink">{s.leads}</b></p>
      )}
    </div>
  );
}
