import Link from "@/components/link";
import { cn } from "@/lib/utils";

/** The one Logs section: punches per employee, raw machine punches, fetch history and the change log. */
export function LogsTabs({ active, counts = {} }: { active: "machine" | "raw" | "fetches" | "changes"; counts?: Partial<Record<"machine" | "raw" | "changes", number>> }) {
  const tabs = [
    ["machine", "/hr/attendance/logs", "Machine & check-ins"],
    ["raw", "/hr/attendance/logs/machine", "Raw machine punches"],
    ["fetches", "/hr/attendance/logs/fetches", "Fetch history"],
    ["changes", "/hr/attendance/logs?tab=changes", "Change log"],
  ] as const;
  return (
    <div className="flex max-w-full overflow-x-auto rounded-lg bg-black/5 p-0.5">
      {tabs.map(([k, href, label]) => (
        <Link key={k} href={href} className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm", active === k ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
          {label}{k in counts && <span className="rounded-full bg-black/5 px-1.5 text-xs tabular-nums">{counts[k as keyof typeof counts]}</span>}
        </Link>
      ))}
    </div>
  );
}
