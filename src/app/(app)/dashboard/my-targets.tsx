import Link from "@/components/link";
import { format } from "date-fns";
import { overallPct, targetProgress } from "@/lib/targets";
import { Card } from "@/components/ui";
import { TargetBars } from "@/components/crm/target-bars";

/** Home: this month's targets and progress for the signed-in person. */
export async function MyTargets({ userId }: { userId: string }) {
  const month = format(new Date(), "yyyy-MM");
  const p = (await targetProgress([userId], month)).get(userId)!;
  const pct = overallPct(p);
  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <p className="flex-1 font-semibold">My targets · {format(new Date(), "MMMM")}</p>
        <span className="text-sm font-semibold tabular-nums">{pct == null ? "No targets set" : `${pct}% done`}</span>
        <Link href="/reports/targets" className="text-xs font-medium text-navy-900 hover:underline">Leaderboard →</Link>
      </div>
      <TargetBars p={p} />
    </Card>
  );
}
