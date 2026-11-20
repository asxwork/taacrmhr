import Link from "@/components/link";
import { ListLink } from "@/components/list-memory";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { OUTCOMES, callAgents, outcome } from "@/lib/calls";
import { fmtPhone } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, Field, LinkButton, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { createBatches, reassignBatch, sendTargetToCrm, setCampaignStatus, uploadNumbers } from "../../actions";
import { CampaignForm } from "@/components/calls/campaign-form";

export const metadata = { title: "Campaign" };
const STATUS_LABEL: Record<string, string> = { new: "New", retry: "Retry later", callback: "Callback", done: "Done", dnc: "Do not call" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; edit?: string }> }) {
  await requirePermission("calls", "create");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await db.callCampaign.findUnique({ where: { id } });
  if (!c) notFound();
  const [byStatus, byOutcome, batches, agents, targets, unassigned] = await Promise.all([
    db.callTarget.groupBy({ by: ["status"], where: { campaignId: id }, _count: true }),
    db.callTarget.groupBy({ by: ["outcome"], where: { campaignId: id, outcome: { not: null } }, _count: true }),
    db.callBatch.findMany({ where: { campaignId: id }, include: { targets: { select: { status: true } } }, orderBy: { createdAt: "asc" } }),
    callAgents(),
    db.callTarget.findMany({ where: { campaignId: id, ...(sp.status && { status: sp.status }) }, orderBy: [{ lastCalledAt: "desc" }, { createdAt: "asc" }], take: 200 }),
    db.callTarget.count({ where: { campaignId: id, assigneeId: null, status: { in: ["new", "retry"] } } }),
  ]);
  const count = (...st: string[]) => byStatus.filter((b) => st.includes(b.status)).reduce((s, b) => s + b._count, 0);
  const total = count("new", "retry", "callback", "done", "dnc");
  const names = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <>
      <ListLink href="/calls/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Campaigns</ListLink>
      <PageHeader title={c.name} description={c.description ?? undefined} actions={
        <div className="flex gap-2">
          <LinkButton href={`/calls/campaigns/${id}?edit=1`} variant="secondary" scroll={false}>Edit</LinkButton>
          <form action={setCampaignStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={c.status === "active" ? "paused" : "active"} /><Button variant="secondary">{c.status === "active" ? "Pause" : "Resume"}</Button></form>
        </div>
      } />
      <DrillTiles className="mb-6 lg:grid-cols-5 xl:grid-cols-5" tiles={[
        { key: "t", label: "Numbers", tone: "navy", value: total, href: `/calls/campaigns/${id}` },
        { key: "n", label: "Not called yet", tone: "sky", value: count("new"), href: `/calls/campaigns/${id}?status=new` },
        { key: "r", label: "To retry", tone: "amber", value: count("retry"), href: `/calls/campaigns/${id}?status=retry` },
        { key: "c", label: "Callbacks", tone: "violet", value: count("callback"), href: `/calls/campaigns/${id}?status=callback` },
        { key: "d", label: "Done", tone: "green", value: count("done", "dnc"), sub: total ? `${Math.round((count("done", "dnc") / total) * 100)}%` : undefined, href: `/calls/campaigns/${id}?status=done` },
      ]} />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Add numbers</h2>
          <ActionForm action={uploadNumbers} className="space-y-3">
            <input type="hidden" name="campaignId" value={id} />
            <textarea name="numbers" rows={5} className="input font-mono text-xs" placeholder={"03001234567\nAli Khan, 0321-7654321\n…or paste rows from Excel"} aria-label="Numbers" />
            <input name="file" type="file" accept=".csv,text/csv,text/plain" aria-label="CSV file" className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-navy-900 file:px-2 file:py-1 file:text-white" />
            <p className="text-xs text-muted">CSV with a header row: a <b>phone</b> (or mobile) column is required; <b>name</b> and any other columns (area, source, budget, notes…) are shown to the agent. Duplicates and do-not-call numbers are skipped. <a href={`/api/calls/sample`} download className="font-medium text-ink underline">Download a sample file</a></p>
            <SubmitButton variant="secondary" pendingText="Importing…">Add numbers</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Make batches</h2>
          <p className="mb-3 text-xs text-muted"><b className="text-ink">{unassigned}</b> unassigned number{unassigned === 1 ? "" : "s"}. Tick agents and set how many batches each gets.</p>
          <ActionForm action={createBatches} className="space-y-3">
            <input type="hidden" name="campaignId" value={id} />
            <Field label="Numbers per batch"><input name="size" type="number" min={1} max={5000} defaultValue={Math.min(50, Math.max(1, unassigned)) || 50} className="input w-32" /></Field>
            {agents.length === 0 ? <p className="text-xs text-muted">Give someone the CSR Agent role first.</p> : (
              <div className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                <div className="flex items-center justify-between bg-canvas/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted"><span>Agent</span><span>Batches</span></div>
                {agents.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm has-[:checked]:bg-navy-900/[0.04]">
                    <input type="checkbox" name="agents" value={a.id} className="accent-navy-900" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <input type="number" name={`count_${a.id}`} min={0} max={100} defaultValue={1} className="input h-8 w-16 text-center" aria-label={`Batches for ${a.name}`} />
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingText="Assigning…">Give batches</SubmitButton>
              <button type="submit" name="mode" value="all" className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm hover:bg-canvas">Split all equally</button>
            </div>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Outcomes</h2>
          <BarList rows={byOutcome.map((o) => ({ name: outcome(o.outcome)?.label ?? o.outcome ?? "", value: o._count, display: String(o._count) })).sort((a, b) => b.value - a.value)} empty="No calls yet." />
        </Card>
      </div>

      <h2 className="mb-2 text-sm font-semibold">Batches</h2>
      <Card className="mb-6 overflow-x-auto">
        {batches.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No batches yet.</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Batch</th><th className="px-4 py-2.5">Progress</th><th className="px-4 py-2.5">Agent</th></tr></thead>
            <tbody className="divide-y divide-line">
              {batches.map((b) => {
                const done = b.targets.filter((t) => ["done", "dnc"].includes(t.status)).length;
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-medium">{b.name}<span className="block text-xs font-normal text-muted">{format(b.createdAt, "d MMM")}</span></td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-2 w-40 rounded-full bg-canvas"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${b.targets.length ? (done / b.targets.length) * 100 : 0}%` }} /></div><span className="text-xs tabular-nums text-muted">{done}/{b.targets.length}</span></div></td>
                    <td className="px-4 py-2.5">
                      <form action={reassignBatch} className="flex gap-2">
                        <input type="hidden" name="batchId" value={b.id} />
                        <select name="agentId" defaultValue={b.assigneeId ?? ""} className="input h-8 w-44 text-xs" aria-label="Agent"><option value="">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                        <button className="rounded px-2 text-xs text-navy-700 hover:bg-canvas">Move</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Numbers {sp.status ? `· ${STATUS_LABEL[sp.status] ?? sp.status}` : ""}</h2>
        <AutoFilterForm><select name="status" defaultValue={sp.status ?? ""} className="input h-8 w-40 text-xs" aria-label="Status"><option value="">All</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></AutoFilterForm>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Number</th><th className="px-4 py-2.5">Agent</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Last outcome</th><th className="px-4 py-2.5">Tries</th><th className="px-4 py-2.5" /></tr></thead>
          <tbody className="divide-y divide-line">
            {targets.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2"><span className="font-medium">{t.name ?? "—"}</span><span className="block font-mono text-xs text-muted">{fmtPhone(t.phone)}</span></td>
                <td className="px-4 py-2">{t.assigneeId ? names.get(t.assigneeId) ?? "—" : <span className="text-muted">unassigned</span>}</td>
                <td className="px-4 py-2">{STATUS_LABEL[t.status] ?? t.status}{t.status === "callback" && t.callbackAt && <span className="block text-xs text-muted">{format(t.callbackAt, "d MMM, h:mm a")}</span>}</td>
                <td className="px-4 py-2">{t.outcome ? <Badge tone={outcome(t.outcome)?.tone === "green" ? "green" : outcome(t.outcome)?.tone === "red" ? "red" : "neutral"}>{outcome(t.outcome)?.label}</Badge> : "—"}{t.lastCalledAt && <span className="block text-xs text-muted">{format(t.lastCalledAt, "d MMM, h:mm a")}</span>}</td>
                <td className="px-4 py-2 tabular-nums">{t.attempts}</td>
                <td className={cn("px-4 py-2 text-right")}>
                  {t.leadId ? <Link href={`/crm/leads/${t.leadId}`} className="text-xs font-medium text-emerald-700 hover:underline">In CRM</Link>
                    : t.outcome === "interested" && <form action={sendTargetToCrm}><input type="hidden" name="targetId" value={t.id} /><button className="text-xs font-medium text-navy-700 hover:underline">Send to CRM</button></form>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-muted">Showing up to 200 numbers. Outcomes: {OUTCOMES.map((o) => o.label).join(", ")}.</p>

      {sp.edit && <Drawer title={`Edit ${c.name}`} closeHref={`/calls/campaigns/${id}`} width="max-w-xl"><CampaignForm c={c} /></Drawer>}
    </>
  );
}
