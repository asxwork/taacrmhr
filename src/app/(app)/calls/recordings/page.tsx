import { redirect } from "next/navigation";
import { format, startOfDay, subDays } from "date-fns";
import { Download, Lock, PhoneIncoming, PhoneOutgoing, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAgents, outcome } from "@/lib/calls";
import { fmtPhone, phoneKey } from "@/lib/crm-shared";
import { pbxConfig, retentionDays } from "@/lib/softphone";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { deleteRecording } from "./actions";

export const metadata = { title: "Recordings" };

const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Calls → Recordings: Super Admin only. Agents and supervisors never see this page or its menu item. */
export default async function RecordingsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; agent?: string; phone?: string }> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const sp = await searchParams;
  const to = sp.to ? startOfDay(new Date(`${sp.to}T00:00:00`)) : startOfDay(new Date());
  const from = sp.from ? startOfDay(new Date(`${sp.from}T00:00:00`)) : subDays(to, 6);
  const key = sp.phone ? phoneKey(sp.phone) : null;
  const [recs, agents, cfg, access, stored] = await Promise.all([
    db.callRecording.findMany({
      where: { startedAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) }, ...(sp.agent ? { agentId: sp.agent } : {}), ...(key ? { phone: { contains: key.slice(-9) } } : {}) },
      orderBy: { startedAt: "desc" }, take: 500,
    }),
    callAgents(true), pbxConfig(),
    db.auditLog.findMany({ where: { entity: "callRecording" }, orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { name: true } } } }),
    db.callRecording.aggregate({ where: { deletedAt: null }, _sum: { size: true }, _count: true }),
  ]);
  const names = new Map(agents.map((a) => [a.id, a.name]));
  const logs = new Map((await db.callLog.findMany({ where: { id: { in: recs.flatMap((r) => (r.logId ? [r.logId] : [])) } }, include: { target: { select: { name: true } } } })).map((l) => [l.id, l]));
  return (
    <>
      <PageHeader eyebrow="Super Admin only" title="Call recordings"
        description={`${stored._count} recording(s) stored · ${((stored._sum.size ?? 0) / 1e6).toFixed(1)} MB · kept ${retentionDays(cfg)} days${cfg.record === "off" ? " · recording is OFF" : ""}. Every play and download is logged.`}
        actions={
          <AutoFilterForm>
            <input type="date" name="from" defaultValue={format(from, "yyyy-MM-dd")} className="input h-9" aria-label="From" />
            <input type="date" name="to" defaultValue={format(to, "yyyy-MM-dd")} className="input h-9" aria-label="To" />
            <select name="agent" defaultValue={sp.agent ?? ""} className="input h-9 w-40" aria-label="Agent"><option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <input name="phone" defaultValue={sp.phone ?? ""} placeholder="Number" className="input h-9 w-36" aria-label="Number" />
          </AutoFilterForm>
        } />
      <Card className="mb-6 overflow-x-auto">
        {recs.length === 0 ? <EmptyState title="No recordings" description="Answered softphone calls appear here once agents' extensions are connected in Phone system." /> : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Agent</th><th className="px-4 py-2.5">Caller</th><th className="px-4 py-2.5">Outcome</th><th className="px-4 py-2.5">Length</th><th className="px-4 py-2.5">Listen</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {recs.map((r) => {
                const log = r.logId ? logs.get(r.logId) : null;
                return (
                  <tr key={r.id} className={r.deletedAt ? "opacity-60" : undefined}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{format(r.startedAt, "d MMM, h:mm a")}</td>
                    <td className="px-4 py-2">{names.get(r.agentId) ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1.5">{r.direction === "in" ? <PhoneIncoming className="size-3.5 text-sky-600" aria-label="Inbound" /> : <PhoneOutgoing className="size-3.5 text-emerald-600" aria-label="Outbound" />}<span className="font-medium">{log?.target?.name ?? "—"}</span></span>
                      <span className="block font-mono text-xs text-muted">{fmtPhone(r.phone)}</span>
                    </td>
                    <td className="px-4 py-2">{log ? <Badge tone={outcome(log.outcome)?.reached ? "green" : "neutral"}>{outcome(log.outcome)?.label ?? log.outcome}</Badge> : "—"}{log?.notes && <span className="block max-w-[200px] truncate text-xs text-muted">{log.notes}</span>}</td>
                    <td className="px-4 py-2 tabular-nums">{dur(r.durationSec)}</td>
                    <td className="px-4 py-2">{r.deletedAt ? <span className="text-xs text-muted">Removed {format(r.deletedAt, "d MMM yyyy")}</span> : <audio controls preload="none" src={`/api/calls/recordings/${r.id}`} className="h-8 w-56" />}</td>
                    <td className="px-4 py-2">
                      {!r.deletedAt && (
                        <div className="flex items-center gap-1">
                          <a href={`/api/calls/recordings/${r.id}?dl=1`} title="Download" aria-label="Download" className="rounded p-1.5 text-muted hover:bg-canvas hover:text-ink"><Download className="size-4" /></a>
                          <form action={deleteRecording}><input type="hidden" name="id" value={r.id} /><button title="Delete recording" aria-label="Delete recording" className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Lock className="size-4" /> Recent access</h2>
        {access.length === 0 ? <p className="text-sm text-muted">Nobody has opened a recording yet.</p> : (
          <ul className="space-y-1.5 text-sm">{access.map((a) => <li key={a.id} className="flex flex-wrap justify-between gap-2"><span><b>{a.user?.name ?? "—"}</b> · {a.summary}</span><span className="text-xs text-muted">{format(a.createdAt, "d MMM, h:mm a")}</span></li>)}</ul>
        )}
      </Card>
    </>
  );
}
