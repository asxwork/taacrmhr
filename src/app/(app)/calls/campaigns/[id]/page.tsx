import { isCallSupervisor, dialerPeople } from "@/lib/calls";
import { redirect } from "next/navigation";
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
import { Badge, Button, Card, Drawer, LinkButton, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { BarList } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { bulkTargets, createBatches, deleteCampaign, reassignBatch, saveVisibleFields, sendTargetToCrm, setCampaignStatus, uploadNumbers } from "../../actions";
import { BulkAll, BulkBar, BulkTick, DeleteCampaign } from "@/components/calls/bulk-bar";
import { CampaignForm } from "@/components/calls/campaign-form";
import { ImportNumbers } from "@/components/calls/import-numbers";
import { CallOrder } from "@/components/calls/call-order";
import { BatchMaker } from "@/components/calls/batch-maker";
import { listImportFiles } from "@/lib/call-files";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Campaign" };
const STATUS_LABEL: Record<string, string> = { new: "New", retry: "Retry later", callback: "Callback", done: "Done", dnc: "Do not call" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; edit?: string }> }) {
  // Supervisors only: CSR agents work their own queue and never manage campaigns, batches or the team.
  if (!isCallSupervisor(await requirePermission("calls"))) redirect("/no-access");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await db.callCampaign.findUnique({ where: { id } });
  if (!c) notFound();
  const [byStatus, byOutcome, batches, agents, targets, unassigned, samples, people] = await Promise.all([
    db.callTarget.groupBy({ by: ["status"], where: { campaignId: id }, _count: true }),
    db.callTarget.groupBy({ by: ["outcome"], where: { campaignId: id, outcome: { not: null } }, _count: true }),
    db.callBatch.findMany({ where: { campaignId: id }, include: { targets: { select: { status: true } } }, orderBy: { createdAt: "asc" } }),
    callAgents(true),
    db.callTarget.findMany({ where: { campaignId: id, ...(sp.status === "round2" ? { round: 2 } : sp.status ? { status: sp.status } : {}) }, orderBy: [{ lastCalledAt: "desc" }, { createdAt: "asc" }], take: 200 }),
    db.callTarget.count({ where: { campaignId: id, assigneeId: null, status: { in: ["new", "retry"] } } }),
    db.callTarget.findMany({ where: { campaignId: id, extra: { not: null } }, select: { extra: true }, take: 300 }),
    dialerPeople(),
  ]);
  const viewer = await requireUser();
  const givers = new Map((await db.user.findMany({ where: { id: { in: [...new Set(targets.map((t) => t.givenById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const files = viewer.isSuperAdmin ? await listImportFiles(id) : [];
  // Every detail column the numbers have, and which ones agents don't see.
  const fields = [...new Set(samples.flatMap((t) => { try { return Object.keys(JSON.parse(t.extra!)); } catch { return []; } }))];
  const hidden = new Set<string>((() => { try { return JSON.parse(c.hiddenFields ?? "[]"); } catch { return []; } })());
  const count = (...st: string[]) => byStatus.filter((b) => st.includes(b.status)).reduce((s, b) => s + b._count, 0);
  const total = count("new", "retry", "callback", "done", "dnc");
  const names = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <>
      <ListLink href="/calls/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Campaigns</ListLink>
      <PageHeader title={c.name} description={`${c.kind === "sales" ? "Sales campaign: sales agents call; an interested caller becomes their own lead." : "CSR campaign: the calling team calls; interested callers go to the sales team by rotation."}${c.description ? ` · ${c.description}` : ""}${c.numbersFrom ? ` · Numbers from: ${c.numbersFrom}` : ""}`} actions={
        <div className="flex gap-2">
          <LinkButton href={`/calls/campaigns/${id}?edit=1`} variant="secondary" scroll={false}>Edit</LinkButton>
          <form action={setCampaignStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={c.status === "active" ? "paused" : "active"} /><Button variant="secondary">{c.status === "active" ? "Pause" : "Resume"}</Button></form>
          <DeleteCampaign id={id} name={c.name} action={deleteCampaign} />
        </div>
      } />
      <DrillTiles className="mb-6 lg:grid-cols-5 xl:grid-cols-5" tiles={[
        { key: "t", label: "Numbers", tone: "navy", value: total, href: `/calls/campaigns/${id}` },
        { key: "n", label: "Not called yet", tone: "sky", value: count("new"), href: `/calls/campaigns/${id}?status=new` },
        { key: "r", label: "To retry", tone: "amber", value: count("retry"), href: `/calls/campaigns/${id}?status=retry` },
        { key: "c", label: "Callbacks", tone: "violet", value: count("callback"), href: `/calls/campaigns/${id}?status=callback` },
        { key: "d", label: "Done", tone: "green", value: count("done", "dnc"), sub: total ? `${Math.round((count("done", "dnc") / total) * 100)}%` : undefined, href: `/calls/campaigns/${id}?status=done` },
      ]} />

      {files.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-1 text-sm font-semibold">Imported files <span className="font-normal text-muted">· Super Admin only</span></h2>
          <p className="mb-2 text-xs text-muted">Exactly as they were uploaded or pasted.</p>
          <ul className="space-y-1 text-sm">{files.map((f) => <li key={f.name}><a href={`/api/calls/files/${id}/${encodeURIComponent(f.name)}`} className="font-medium text-navy-900 hover:underline">{f.name}</a> <span className="text-xs text-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span></li>)}</ul>
        </Card>
      )}
      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Call order</h2>
        <CallOrder campaignId={id} order={c.callOrder} field={c.orderField} desc={c.orderDesc} fields={fields} />
      </Card>
      {fields.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-1 text-sm font-semibold">What agents see</h2>
          <p className="mb-3 text-xs text-muted">Tick the details shown on the agent&apos;s dialer. Unticked ones stay saved with the number; only supervisors see them here.</p>
          <ActionForm action={saveVisibleFields} className="space-y-3">
            <input type="hidden" name="campaignId" value={id} />
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <label key={f} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm has-[:checked]:border-navy-900/40 has-[:checked]:bg-navy-900/[0.04]">
                  <input type="hidden" name="field" value={f} />
                  <input type="checkbox" name="show" value={f} defaultChecked={!hidden.has(f)} className="accent-navy-900" /> {f}
                </label>
              ))}
            </div>
            <SubmitButton variant="secondary" pendingText="Saving…">Save</SubmitButton>
          </ActionForm>
        </Card>
      )}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Add numbers</h2>
          <ImportNumbers campaignId={id} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">Or paste numbers</summary>
            <ActionForm action={uploadNumbers} className="mt-2 space-y-2">
              <input type="hidden" name="campaignId" value={id} />
              <textarea name="numbers" rows={4} className="input font-mono text-xs" placeholder={"03001234567\nAli Khan, 0321-7654321\n+971 50 123 4567"} aria-label="Numbers" />
              <SubmitButton variant="secondary" pendingText="Adding…">Add numbers</SubmitButton>
            </ActionForm>
          </details>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Make batches</h2>
          <BatchMaker campaignId={id} unassigned={unassigned} people={people} kind={c.kind === "sales" ? "sales" : "csr"} action={createBatches} />
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
                    <td className="px-4 py-2.5 font-medium">{b.name}<span className="block text-xs font-normal text-muted">{format(b.createdAt, "d MMM")}{b.completedAt && <span className="ml-1.5 font-medium text-emerald-700">· Completed by agent {format(b.completedAt, "d MMM, h:mm a")}</span>}</span></td>
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
        <h2 className="text-sm font-semibold">Numbers {sp.status ? `· ${sp.status === "round2" ? "2nd round" : STATUS_LABEL[sp.status] ?? sp.status}` : ""}</h2>
        <AutoFilterForm><select name="status" defaultValue={sp.status ?? ""} className="input h-8 w-40 text-xs" aria-label="Status"><option value="">All</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="round2">2nd round</option></select></AutoFilterForm>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="w-10 px-4 py-2.5"><BulkAll form="bulk-numbers" /></th><th className="px-4 py-2.5">Number</th><th className="px-4 py-2.5">Agent · given by</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Last outcome</th><th className="px-4 py-2.5">Tries</th><th className="px-4 py-2.5" /></tr></thead>
          <tbody className="divide-y divide-line">
            {targets.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2"><BulkTick form="bulk-numbers" id={t.id} label={t.name ?? t.phone} /></td>
                <td className="px-4 py-2"><span className="font-medium">{t.name ?? "—"}</span><span className="block font-mono text-xs text-muted">{fmtPhone(t.phone)}</span></td>
                <td className="px-4 py-2">{t.assigneeId ? names.get(t.assigneeId) ?? "—" : <span className="text-muted">unassigned</span>}{t.givenById && <span className="block text-xs text-muted">by {names.get(t.givenById) ?? givers.get(t.givenById) ?? "—"}{t.givenAt ? ` · ${format(t.givenAt, "d MMM")}` : ""}</span>}</td>
                <td className="px-4 py-2">{STATUS_LABEL[t.status] ?? t.status}{t.round === 2 && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">2nd round</span>}{t.status === "callback" && t.callbackAt && <span className="block text-xs text-muted">{format(t.callbackAt, "d MMM, h:mm a")}</span>}</td>
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
      <BulkBar form="bulk-numbers" action={bulkTargets} noun="number(s)" people={agents.map((a) => ({ id: a.id, name: a.name }))} ops={[{ value: "assign", label: "Give to an agent", needsPerson: true }, { value: "unassign", label: "Back to unassigned" }, { value: "reset", label: "Call again (reset)" }, { value: "dnc", label: "Do not call", danger: true }, { value: "delete", label: "Delete", danger: true }]} />
      <p className="mt-2 text-xs text-muted">Showing up to 200 numbers. Outcomes: {OUTCOMES.map((o) => o.label).join(", ")}.</p>

      {sp.edit && <Drawer title={`Edit ${c.name}`} closeHref={`/calls/campaigns/${id}`} width="max-w-xl"><CampaignForm c={c} /></Drawer>}
    </>
  );
}
