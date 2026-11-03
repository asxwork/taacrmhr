import { cn } from "@/lib/utils";
import { fmtPKR } from "@/lib/crm-shared";
import type { Progress } from "@/lib/targets";

const ROWS = [["calls", "Calls"], ["visits", "Site visits"], ["deals", "Deals won"], ["wonValue", "Won value"]] as const;

/** Progress bars: actual vs. target for each set target (unset ones show the actual only). */
export function TargetBars({ p }: { p: Progress }) {
  return (
    <div className="space-y-2.5">
      {ROWS.map(([k, label]) => {
        const t = p.target[k], a = p.actual[k];
        const pct = t ? Math.min(100, Math.round((a / t) * 100)) : 0;
        const fmt = (v: number) => (k === "wonValue" ? fmtPKR(v) : String(v));
        return (
          <div key={k}>
            <div className="flex justify-between text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted">{fmt(a)}{t ? ` / ${fmt(t)}` : ""}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5">{t > 0 && <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />}</div>
          </div>
        );
      })}
    </div>
  );
}
