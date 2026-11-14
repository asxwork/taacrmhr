import Link from "@/components/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ResourceInn-style drill-down tiles: tinted card, accent dash, label, big number; each opens its list.
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
  gold: { tile: "bg-gold-400/10 border-gold-400/20", bar: "bg-gold-400", num: "text-gold-600" },
};

export type DrillTile = { key: string; label: string; tone: string; value: string | number; sub?: string; href?: string };

/** hideZero: tiles showing 0 fold into "Show N more" so the numbers that matter come first. */
export function DrillTiles({ tiles, className, hideZero }: { tiles: DrillTile[]; className?: string; hideZero?: boolean }) {
  const isZero = (t: DrillTile) => t.value === 0 || t.value === "0";
  const shown = hideZero ? tiles.filter((t) => !isZero(t)) : tiles;
  const folded = hideZero ? tiles.filter(isZero) : [];
  const grid = cn("stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", className);
  return (
    <>
      {shown.length > 0 && <div className={grid}>{shown.map(tile)}</div>}
      {folded.length > 0 && (
        <details className={cn("group/more", shown.length > 0 && "mt-3")}>
          <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open/more:hidden">Show {folded.length} more at 0 ({folded.map((t) => t.label).slice(0, 4).join(", ")}{folded.length > 4 ? "…" : ""})</span>
            <span className="hidden group-open/more:inline">Hide the ones at 0</span>
          </summary>
          <div className={cn(grid, "mt-3")}>{folded.map(tile)}</div>
        </details>
      )}
    </>
  );
}

function tile(t: DrillTile) {
  const tone = TONES[t.tone] ?? TONES.slate!;
  const zero = t.value === 0 || t.value === "0";
  const body = (
    <>
      <span className={cn("mb-3 block h-0.5 w-6 rounded-full", tone.bar)} />
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight">{t.label}</span>
        {t.href && <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />}
      </span>
      <span className={cn("mt-1 block truncate text-2xl font-semibold tabular-nums", zero ? "text-muted" : tone.num)}>{t.value}</span>
      {t.sub && <span className="mt-0.5 block truncate text-xs text-muted">{t.sub}</span>}
    </>
  );
  const cls = cn("group relative overflow-hidden rounded-xl border p-4", tone.tile, t.href && "transition hover:-translate-y-0.5 hover:shadow-md");
  return t.href ? <Link key={t.key} href={t.href} className={cls}>{body}</Link> : <div key={t.key} className={cls}>{body}</div>;
}
