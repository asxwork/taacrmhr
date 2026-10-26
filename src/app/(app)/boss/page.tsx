import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { PERIODS, resolvePeriod } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { hrefWith } from "@/components/crm/bits";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { bossLinks } from "./links";
import { BossOverview } from "./overview";
import { BossCrmReport } from "./crm-report";
import { BossHrReport } from "./hr-report";

export const metadata = { title: "Boss dashboard" };

type SP = { tab?: string; period?: string; from?: string; to?: string };
const TABS = [["overview", "Overview"], ["crm", "CRM report"], ["hr", "HR report"]] as const;

/** The owner's view of the business: an overview, and separate detailed CRM and HR reports for any period. */
export default async function BossPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!user.isBoss && !user.isSuperAdmin) redirect("/no-access");
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "overview";
  const { from, to } = resolvePeriod(sp.period, sp.from, sp.to);
  const links = await bossLinks(from, to);
  const keep = { period: sp.period, from: sp.from, to: sp.to };

  return (
    <>
      <PageHeader title="Boss dashboard" description={`${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-black/5 p-0.5">
          {TABS.map(([t, label]) => (
            <Link key={t} href={hrefWith("/boss", keep, { tab: t === "overview" ? undefined : t })} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
          ))}
        </div>
        <AutoFilterForm className="flex flex-wrap items-end gap-2 sm:ml-auto">
          {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
          <select name="period" defaultValue={sp.period ?? "month"} className="input h-9 w-40" aria-label="Period">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input type="date" name="from" defaultValue={sp.period === "custom" ? sp.from : ""} className="input h-9 w-40" aria-label="From (custom)" />
          <input type="date" name="to" defaultValue={sp.period === "custom" ? sp.to : ""} className="input h-9 w-40" aria-label="To (custom)" />
        </AutoFilterForm>
      </div>

      {tab === "crm" ? <BossCrmReport user={user} from={from} to={to} links={links} />
        : tab === "hr" ? <BossHrReport user={user} from={from} to={to} />
        : <BossOverview user={user} from={from} to={to} links={links} />}
    </>
  );
}
