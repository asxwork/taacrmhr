import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Badge, Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CampaignForm } from "@/components/calls/campaign-form";

export const metadata = { title: "Campaigns" };
const TONE = { active: "green", paused: "amber", done: "neutral" } as const;

/** Calls → Campaigns: each campaign is a list of numbers with a script and WhatsApp message, split into batches. */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requirePermission("calls", "create");
  const sp = await searchParams;
  const campaigns = await db.callCampaign.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { _count: { select: { targets: true, batches: true } } } });
  const counts = await db.callTarget.groupBy({ by: ["campaignId", "status"], _count: true });
  const n = (id: string, ...st: string[]) => counts.filter((c) => c.campaignId === id && st.includes(c.status)).reduce((s, c) => s + c._count, 0);

  return (
    <>
      <PageHeader title="Campaigns & batches" description="Upload numbers into a campaign, then split them into batches for your agents."
        actions={<LinkButton href="/calls/campaigns?new=1" scroll={false}><Plus className="size-4" /> New campaign</LinkButton>} />
      <Card className="overflow-x-auto">
        {campaigns.length === 0 ? <EmptyState title="No campaigns yet" description="Create one, paste or upload numbers, and hand out batches." /> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Campaign</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Numbers</th><th className="px-4 py-2.5 text-right">Left to call</th><th className="px-4 py-2.5 text-right">Done</th><th className="px-4 py-2.5 text-right">Batches</th><th className="px-4 py-2.5">Created</th></tr></thead>
            <tbody className="divide-y divide-line">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5"><Link href={`/calls/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>{c.description && <span className="block text-xs text-muted">{c.description}</span>}</td>
                  <td className="px-4 py-2.5"><Badge tone={TONE[c.status as keyof typeof TONE] ?? "neutral"}>{c.status}</Badge></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c._count.targets}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n(c.id, "new", "retry", "callback")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n(c.id, "done", "dnc")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c._count.batches}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{format(c.createdAt, "d MMM yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {sp.new && (
        <Drawer title="New campaign" closeHref="/calls/campaigns" width="max-w-xl">
          <CampaignForm />
        </Drawer>
      )}
    </>
  );
}
