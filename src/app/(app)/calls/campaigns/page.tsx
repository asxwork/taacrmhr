import { isCallSupervisor } from "@/lib/calls";
import { redirect } from "next/navigation";
import Link from "@/components/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { Badge, Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { BulkAll, BulkBar, BulkTick } from "@/components/calls/bulk-bar";
import { CampaignForm } from "@/components/calls/campaign-form";

import { createDemoCampaign, bulkCampaigns } from "../actions";

export const metadata = { title: "Campaigns" };
const TONE = { active: "green", paused: "amber", done: "neutral" } as const;

/** Calls → Campaigns: each campaign is a list of numbers with a script and WhatsApp message, split into batches. */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  // Supervisors only: CSR agents work their own queue and never manage campaigns, batches or the team.
  if (!isCallSupervisor(await requirePermission("calls"))) redirect("/no-access");
  const sp = await searchParams;
  const campaigns = await db.callCampaign.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { _count: { select: { targets: true, batches: true } } } });
  const counts = await db.callTarget.groupBy({ by: ["campaignId", "status"], _count: true });
  const n = (id: string, ...st: string[]) => counts.filter((c) => c.campaignId === id && st.includes(c.status)).reduce((s, c) => s + c._count, 0);

  return (
    <>
      <PageHeader title="Campaigns & batches" description="1. New campaign  2. Open it and add numbers (paste, or a CSV like the sample)  3. Make batches: tick the agents, and their numbers appear on their dialer."
        actions={<><form action={createDemoCampaign}><button className="inline-flex h-10 items-center rounded-lg border border-dashed border-line px-3 text-sm text-muted hover:bg-canvas hover:text-ink" title="30 fake numbers (0300-0000xxx) to practise with">Create demo campaign</button></form><a href={`/api/calls/sample`} download className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm hover:bg-canvas">Sample CSV</a><LinkButton href="/calls/campaigns?new=1" scroll={false}><Plus className="size-4" /> New campaign</LinkButton></>} />
      <Card className="overflow-x-auto">
        {campaigns.length === 0 ? <EmptyState title="No campaigns yet" description="Create one, paste or upload numbers, and hand out batches." /> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="w-10 px-4 py-2.5"><BulkAll form="bulk-campaigns" /></th><th className="px-4 py-2.5">Campaign</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Numbers</th><th className="px-4 py-2.5 text-right">Left to call</th><th className="px-4 py-2.5 text-right">Done</th><th className="px-4 py-2.5 text-right">Batches</th><th className="px-4 py-2.5">Created</th></tr></thead>
            <tbody className="divide-y divide-line">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5"><BulkTick form="bulk-campaigns" id={c.id} label={c.name} /></td>
                  <td className="px-4 py-2.5"><Link href={`/calls/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>{c.description && <span className="block text-xs text-muted">{c.description}</span>}</td>
                  <td className="px-4 py-2.5"><Badge tone={c.kind === "sales" ? "gold" : "navy"}>{c.kind === "sales" ? "Sales" : "CSR"}</Badge></td>
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
      <BulkBar form="bulk-campaigns" action={bulkCampaigns} noun="campaign(s)" ops={[{ value: "active", label: "Activate" }, { value: "paused", label: "Pause" }, { value: "done", label: "Mark done" }, { value: "delete", label: "Delete (with their numbers)", danger: true }]} />
      {sp.new && (
        <Drawer title="New campaign" closeHref="/calls/campaigns" width="max-w-xl">
          <CampaignForm />
        </Drawer>
      )}
    </>
  );
}
