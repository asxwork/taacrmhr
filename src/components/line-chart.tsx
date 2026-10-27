// Smooth line / area chart in plain SVG (no chart library), for trends on the HR dashboard. Several series share
// one axis; every point has a hover title with its exact value. Colours are CSS colours so dark mode keeps them.

export type Series = { name: string; color: string; values: number[] };

const W = 720;
const H = 220;
const PAD = { l: 56, r: 28, t: 12, b: 28 };

/** Catmull-Rom → cubic Bézier, so the line passes through every point without overshooting much. */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return pts.map(([x, y]) => `M${x},${y}`).join("");
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    // Control points stay inside the plot so the curve never dips below zero or above the top.
    const clampY = (v: number) => Math.min(H - PAD.b, Math.max(PAD.t, v));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function LineChart({ labels, series, format = (v) => String(v), min, area = true, empty = "No data yet." }: {
  labels: string[]; series: Series[]; format?: (v: number) => string; min?: number; area?: boolean; empty?: string;
}) {
  const all = series.flatMap((s) => s.values);
  if (!labels.length || !all.length) return <p className="py-10 text-center text-sm text-muted">{empty}</p>;
  const lo = min ?? Math.min(0, ...all);
  const hi = Math.max(lo + 1, ...all);
  const x = (i: number) => PAD.l + (labels.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (labels.length - 1));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [hi, lo + (hi - lo) / 2, lo];
  const every = Math.ceil(labels.length / 10);
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap justify-center gap-4 text-xs text-muted">
          {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeDasharray={i === 2 ? undefined : "3 4"} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[10px]">{format(Math.round(t))}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 || i === labels.length - 1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">{l}</text>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
          const line = smooth(pts);
          return (
            <g key={s.name}>
              {area && <path d={`${line} L${pts.at(-1)![0]},${y(lo)} L${pts[0]![0]},${y(lo)} Z`} fill={s.color} opacity={0.12} />}
              <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" />
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={labels.length > 40 ? 0 : 3} fill={s.color}>
                  <title>{`${labels[i]} · ${s.name}: ${format(s.values[i]!)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
