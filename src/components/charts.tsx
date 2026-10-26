import Link from "next/link";

// Minimal single-series charts in plain HTML/CSS (no chart library).
// One accent hue (--chart, swapped for dark mode), thin marks with 4px rounded data-ends,
// recessive axis text, hover tooltip on every mark, and exact values available in adjacent tables.

/** Vertical columns over time. Labels thin out automatically so they never collide. */
export function ColumnChart({ data, unit }: { data: { label: string; short: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = Math.ceil(data.length / 12);
  const ticks = [max, Math.round(max / 2), 0];
  return (
    <div className="flex gap-2">
      <div className="flex h-44 flex-col justify-between pb-5 text-right text-[11px] text-muted">
        {ticks.map((t, i) => <span key={i}>{t}</span>)}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%-1.25rem)] border-b border-line">
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line/70" />
        </div>
        <div className="flex h-44 items-end gap-[2px]">
          {data.map((d, i) => (
            <div key={i} className="group relative flex h-full flex-1 flex-col justify-end pb-5">
              <div
                className="mx-auto w-full max-w-6 rounded-t-[4px] bg-[var(--chart)] transition group-hover:opacity-80"
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }}
              />
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[11px] text-muted">{i % every === 0 ? d.short : ""}</span>
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-950 px-2 py-1 text-xs text-white shadow group-hover:block">
                {d.label}: <b>{d.value}</b> {unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars with the label above and the value at the end, in text ink (not the bar colour). */
/** `href` makes a row open the list behind it (everything on a report leads somewhere). */
export function BarList({ rows, empty = "No data for this period." }: { rows: { name: string; value: number; display: string; sub?: string; href?: string }[]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name} className="group relative">
          {r.href && <Link href={r.href} className="absolute inset-0 z-[1] rounded" aria-label={`${r.name}: ${r.display}`} />}
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className={r.href ? "truncate group-hover:underline" : "truncate"}>{r.name}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.display}{r.sub && <span className="ml-1.5 text-xs font-normal text-muted">{r.sub}</span>}</span>
          </div>
          <div className="h-2.5 rounded-full bg-canvas">
            <div className="h-full rounded-full bg-[var(--chart)] transition group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
