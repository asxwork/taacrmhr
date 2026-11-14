import Link from "@/components/link";
import { cn } from "@/lib/utils";
import { HEAD_OFFICE } from "@/lib/finance";

/** All offices / head office / each branch, as small tabs. */
export function OfficeSwitch({ offices, value, base }: { offices: string[]; value?: string; base: string }) {
  const href = (o?: string) => `${base}${o ? `${base.includes("?") ? "&" : "?"}office=${encodeURIComponent(o)}` : ""}`;
  const tabs: [string | undefined, string][] = [[undefined, "All offices"], ["head", HEAD_OFFICE.replace(" (DHA)", "")], ...offices.map((o) => [o, o] as [string, string])];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
      {tabs.map(([v, l]) => <Link key={l} href={href(v)} className={cn("rounded-md px-2.5 py-1", value === v ? "bg-navy-900 text-white" : "text-muted hover:bg-canvas")}>{l}</Link>)}
    </div>
  );
}
