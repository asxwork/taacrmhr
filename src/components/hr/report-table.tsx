import { EmptyState } from "@/components/ui";

/** Simple numeric report table: numbers right-aligned with thousands separators; a "Total" row is bold. */
export function ReportTable({ head, rows, empty = "No data for this month." }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
        <tr>{head.map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          <tr key={i} className={r[0] === "Total" ? "bg-canvas/40 font-semibold" : undefined}>
            {r.map((c, j) => <td key={j} className={typeof c === "number" ? "px-4 py-2 text-right tabular-nums" : "px-4 py-2"}>{typeof c === "number" ? c.toLocaleString("en-PK") : c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
