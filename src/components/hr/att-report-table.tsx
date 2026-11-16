import { DAY_STATUSES } from "@/lib/attendance-shared";
import type { Cell, ReportOut } from "@/lib/attendance-templates-shared";
import { fileUrl } from "@/lib/files";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui";

function CellView({ c, grid }: { c: Cell; grid?: boolean }) {
  if (c == null || c === "") return <span className="text-muted/40">{grid ? "" : "—"}</span>;
  if (typeof c !== "object") return <>{typeof c === "number" ? c.toLocaleString("en-PK") : c}</>;
  if ("img" in c) {
    // eslint-disable-next-line @next/next/no-img-element
    return <a href={fileUrl(c.img)} target="_blank" rel="noreferrer"><img src={fileUrl(c.img, 120)} alt={c.t ?? ""} className="size-12 rounded-lg object-cover ring-1 ring-line" loading="lazy" /></a>;
  }
  const st = DAY_STATUSES[c.s];
  if (!st.short && !c.t) return null;
  return (
    <span className={cn("inline-flex flex-col items-center leading-tight", !grid && "flex-row gap-2")}>
      {st.short && <span className={cn("inline-flex min-w-6 justify-center rounded px-1 py-0.5 text-[11px] font-semibold", color(st.color).pill)} title={st.label}>{grid ? st.short : st.label}</span>}
      {c.t && <span className="whitespace-nowrap text-[10px] text-muted">{c.t}</span>}
    </span>
  );
}

/** Any attendance template output: plain tables, or calendars (one sticky name column, compact day cells). */
export function AttReportTable({ out }: { out: ReportOut }) {
  if (!out.rows.length) return <EmptyState title="Nothing to show" description={out.note ?? "No attendance in this period for these filters."} />;
  // Calendars: column 0 is the code, column 1 the name; they show as one sticky "Employee" column.
  const head = out.grid ? ["Employee", ...out.head.slice(2)] : out.head;
  const weekend = (h: string) => out.grid && /\b(Sa|Su)$/.test(h);
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", out.grid ? "border-separate border-spacing-0" : "min-w-[640px]")}>
        <thead className="bg-canvas/60 text-left text-[11px] uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn("whitespace-nowrap border-b border-line font-medium", out.grid ? "px-1.5 py-2 text-center" : "px-4 py-2.5",
                out.grid && i === 0 && "sticky left-0 z-10 min-w-44 border-r bg-canvas px-3 text-left", weekend(h) && "bg-slate-100/70")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {out.rows.map((r, ri) => {
            const isTotal = out.total && ri === out.rows.length - 1;
            const cells = out.grid ? r.slice(2) : r;
            return (
              <tr key={ri} className={cn("hover:bg-canvas/50", isTotal && "bg-canvas/60 font-semibold")}>
                {out.grid && (
                  <td className="sticky left-0 z-[5] whitespace-nowrap border-b border-r border-line/70 bg-surface px-3 py-1.5">
                    <span className="block font-medium">{String(r[1] ?? "")}</span><span className="block text-[11px] text-muted">{String(r[0] ?? "")}</span>
                  </td>
                )}
                {cells.map((c, ci) => (
                  <td key={ci} className={cn("border-b border-line/70", out.grid ? "px-1.5 py-1.5 text-center" : "px-4 py-2", typeof c === "number" && !out.grid && "tabular-nums",
                    weekend(head[out.grid ? ci + 1 : ci] ?? "") && "bg-slate-50")}>
                    <CellView c={c} grid={out.grid} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
