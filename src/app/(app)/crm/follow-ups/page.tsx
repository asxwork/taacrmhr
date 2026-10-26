import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePermission, scopeFor, scopeWhere } from "@/lib/permissions";
import { followUpLists } from "@/lib/agent-reports";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { FollowUpLists } from "@/components/crm/follow-up-lists";

export const metadata = { title: "My follow-ups" };

/** Agents' daily to-do from their own leads (managers see their team, per the leads scope). */
export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requirePermission("crm.leads");
  const sp = await searchParams;
  const scope = (await scopeWhere(user, "crm.leads")) as Prisma.LeadWhereInput;
  const lists = await followUpLists(scope);
  const own = scopeFor(user, "crm.leads") === "own";
  const chips: [string | undefined, string, number][] = [
    [undefined, "Everything", lists.overdue.length + lists.dueToday.length + lists.neverContacted.length + lists.noNextStep.length + lists.stale.length],
    ["overdue", "Overdue", lists.overdue.length],
    ["today", "Due today", lists.dueToday.length],
    ["never", "Not contacted", lists.neverContacted.length],
    ["noplan", "No follow-up", lists.noNextStep.length],
    ["stale", "7+ days", lists.stale.length],
  ];

  return (
    <>
      <PageHeader title="My follow-ups" description={own ? "Your leads that need a call or a next step." : "Leads in your scope that need a call or a next step."} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map(([key, label, n]) => (
          <Link key={label} href={key ? `/crm/follow-ups?show=${key}` : "/crm/follow-ups"}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", (sp.show ?? undefined) === key ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}>
            {label}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", (sp.show ?? undefined) === key ? "bg-white/20" : n ? "bg-red-50 text-red-700" : "bg-black/5")}>{n}</span>
          </Link>
        ))}
      </div>
      <FollowUpLists lists={lists} showOwner={!own} only={sp.show} />
    </>
  );
}
