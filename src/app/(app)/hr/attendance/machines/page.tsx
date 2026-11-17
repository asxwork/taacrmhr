import Link from "@/components/link";
import { headers } from "next/headers";
import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, Cpu, Fingerprint, KeyRound, Network, Users, Pencil, Plus, Power, RefreshCw, Route, Trash2, X } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { MACHINE_TIME_ZONES } from "@/lib/attendance-shared";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { deleteMachine, saveMachine, setMachineActive, syncMachineNow, updateMachine } from "./actions";

export const metadata = { title: "Attendance machines" };

type SP = { show?: string; new?: string; edit?: string };

/**
 * Attendance → Machines, laid out like ResourceInn: Machines / Logs tabs, a table with All / Active / Inactive, and a
 * Create / Edit form in the same sections (machine information, connection, routing, authentication).
 */
export default async function MachinesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.attendance");
  const sp = await searchParams;
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.attendance", "edit") === "all";
  const h = await headers();
  const appHost = (process.env.APP_URL ? new URL(process.env.APP_URL).host : h.get("x-forwarded-host") ?? h.get("host") ?? "your-domain.com").replace(/:\d+$/, "");
  const [machines, branches] = await Promise.all([
    db.attendanceMachine.findMany({ orderBy: [{ status: "asc" }, { createdAt: "asc" }] }),
    db.branch.findMany({ where: { active: true }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } }),
  ]);
  const online = (d: Date | null) => !!d && Date.now() - d.getTime() < 15 * 60_000;
  const isActive = (s: string) => s === "approved";
  const show = sp.show === "active" || sp.show === "inactive" ? sp.show : "all";
  const shown = machines.filter((m) => show === "all" || (show === "active") === isActive(m.status));
  const editing = canEdit ? (sp.edit ? machines.find((m) => m.id === sp.edit) ?? null : null) : null;
  const formOpen = canEdit && (sp.new === "1" || !!editing);
  const counts = { all: machines.length, active: machines.filter((m) => isActive(m.status)).length, inactive: machines.filter((m) => !isActive(m.status)).length };

  return (
    <>
      {!formOpen && <AutoRefresh seconds={30} />}
      <PageHeader title="Machines" description="Manage attendance machines from one place." actions={canEdit ? (
        <Link href="/hr/attendance/machines?new=1" scroll={false} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> Create</Link>
      ) : undefined} />

      <Card className="overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-3">
          {([["all", "All", "bg-sky-100 text-sky-800"], ["active", "Active", "bg-emerald-100 text-emerald-800"], ["inactive", "Inactive", "bg-red-100 text-red-700"]] as const).map(([k, l, tone]) => (
            <Link key={k} href={k === "all" ? "/hr/attendance/machines" : `/hr/attendance/machines?show=${k}`} className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm", show === k ? "border-navy-900 font-medium" : "border-transparent text-muted hover:text-ink")}>
              <span className={cn("rounded-md px-1.5 text-xs font-semibold tabular-nums", tone)}>{counts[k]}</span>{l}
            </Link>
          ))}
        </div>
        {shown.length === 0 ? (
          <EmptyState title={machines.length ? "No machines here" : "No machines yet"} description={machines.length ? "Try the All tab." : "Click Create and enter the machine's public IP and port (usually 4370), like in ResourceInn."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>{["Name", "Machine type", "IP : Port", "Active", "Status", "Last logs retrieved", "Total attendance", ""].map((x) => <th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((m) => {
                  const branch = branches.find((b) => b.id === m.branchId);
                  const on = online(m.lastSeenAt);
                  return (
                    <tr key={m.id} className="align-top hover:bg-canvas/40">
                      <td className="px-4 py-3">
                        <Link href={`/hr/attendance/machines/${m.id}`} className="font-medium hover:underline">{m.name ?? m.serial}</Link>
                        <p className="text-xs text-muted">{[branch?.name, m.mode === "push" ? `Cloud Server · SN ${m.serial}` : m.transport ? `Direct · ${m.transport.toUpperCase()}` : "Direct"].filter(Boolean).join(" · ")}</p>
                        {m.lastError && m.mode === "pull" && <p className="mt-1.5 max-w-[15rem] rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{m.lastError}</p>}
                        {m.unknownIds && <p className="mt-1.5 max-w-[15rem] rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">Machine users not mapped: <b>{m.unknownIds.split(",").slice(0, 12).join(", ")}</b> · <Link href={`/hr/attendance/machines/${m.id}`} className="underline">map them</Link></p>}
                      </td>
                      <td className="px-4 py-3">ZKTeco</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{m.host ?? m.ip ?? "—"}{m.mode === "pull" ? `:${m.port ?? 4370}` : ""}</td>
                      <td className="px-4 py-3">{m.status === "pending" ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Waiting</span> : <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", isActive(m.status) ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700")}>{isActive(m.status) ? "Active" : "Inactive"}</span>}</td>
                      <td className="px-4 py-3"><span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold", on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600")}><span className={cn("size-1.5 rounded-full", on ? "bg-emerald-500" : "bg-slate-400")} />{on ? "Online" : "Offline"}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{m.lastSeenAt ? <><span className="block">{format(m.lastSeenAt, "MMM d, yyyy h:mm a")}</span><span className="text-muted">{formatDistanceToNow(m.lastSeenAt, { addSuffix: true })}</span></> : <span className="text-muted">Never</span>}</td>
                      <td className="px-4 py-3"><span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-sky-800">{m.punches.toLocaleString("en-PK")}</span></td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-0.5">
                            <Link href={`/hr/attendance/machines/${m.id}`} title="Change mapping (machine users ↔ employees)" aria-label="Change mapping" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"><Users className="size-4" /></Link>
                            <Link href={`/hr/attendance/machines?edit=${m.id}`} scroll={false} title="Edit" aria-label="Edit machine" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"><Pencil className="size-4" /></Link>
                            {m.mode === "pull" && isActive(m.status) && <ActionForm action={syncMachineNow}><input type="hidden" name="id" value={m.id} /><button title="Fetch logs now" aria-label="Fetch logs now" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"><RefreshCw className="size-4" /></button></ActionForm>}
                            {m.status === "pending" && <form action={updateMachine}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="approved" /><button title="Approve" aria-label="Approve machine" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink text-emerald-600"><CheckCircle2 className="size-4" /></button></form>}
                            {m.status !== "pending" && <form action={setMachineActive}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="active" value={isActive(m.status) ? "0" : "1"} /><button title={isActive(m.status) ? "Make inactive" : "Make active"} aria-label={isActive(m.status) ? "Make inactive" : "Make active"} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"><Power className="size-4" /></button></form>}
                            {user.isSuperAdmin && <form action={deleteMachine}><input type="hidden" name="id" value={m.id} /><button title="Delete" aria-label="Delete machine" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink hover:text-red-600"><Trash2 className="size-4" /></button></form>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <details className="mt-6 rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold"><Fingerprint className="size-4" /> Help: machine sends to AMS (Cloud Server) instead</summary>
        <div className="border-t border-line px-5 py-4 text-sm">
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">A machine can send to only one Cloud Server. If ResourceInn already uses this setting, don’t change it; use Create (direct IP) instead.</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>On the machine: <b>Menu → Comm. → Cloud Server Setting</b> (ADMS) → server <span className="font-mono">{appHost}</span>, port 443 (or 80), domain name ON, proxy OFF.</li>
            <li>Restart it. It appears in the table as <b>Waiting</b>; check the serial number and choose <b>Approve</b> from the ⋮ menu.</li>
            <li>Set each employee’s device user ID so their punches count.</li>
          </ol>
        </div>
      </details>

      {formOpen && <MachineForm m={editing} branches={branches} />}
    </>
  );
}

type M = Awaited<ReturnType<typeof db.attendanceMachine.findMany>>[number];

/** Create / Edit dialog with ResourceInn's sections. */
function MachineForm({ m, branches }: { m: M | null; branches: { id: string; name: string; address: string | null }[] }) {
  const row = (label: string, req: boolean, field: React.ReactNode, hint?: string) => (
    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <span className="text-sm font-medium">{label}{req && <span className="text-red-600"> *</span>}</span>
      <div>{field}{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</div>
    </div>
  );
  const section = (Icon: React.ComponentType<{ className?: string }>, title: string) => <h3 className="mb-1 mt-6 flex items-center gap-2 border-b border-line pb-2 text-sm font-semibold first:mt-0"><Icon className="size-4 text-muted" /> {title}</h3>;
  const push = m?.mode === "push";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={m ? "Edit machine" : "Create machine"}>
      <Link href="/hr/attendance/machines" scroll={false} className="absolute inset-0 bg-navy-950/40" aria-label="Close" />
      <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:max-w-3xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold">Machine <span className="font-normal text-muted">{m ? "Edit" : "Create"}</span></h2>
          <Link href="/hr/attendance/machines" scroll={false} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label="Close"><X className="size-4" /></Link>
        </header>
        <ActionForm action={saveMachine} successHref="/hr/attendance/machines" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {m && <input type="hidden" name="id" value={m.id} />}
            {section(Cpu, "Machine information")}
            {row("Company", false, <input value="The Advisor Associates" readOnly className="input bg-canvas/60" aria-label="Company" />)}
            {row("Branch", false, <select name="branchId" defaultValue={m?.branchId ?? ""} className="input"><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>)}
            {row("Location", false, <input name="location" defaultValue={m?.location ?? ""} placeholder={branches[0]?.address ?? "Office address"} className="input" />)}
            {row("Time zone", true, <select name="timeZone" defaultValue={m?.timeZone ?? "Asia/Karachi"} className="input">{MACHINE_TIME_ZONES.map((t) => <option key={t}>{t}</option>)}</select>)}
            {row("Machine name", true, <input name="name" required defaultValue={m?.name ?? ""} placeholder="e.g. TAA-DHA" className="input" />)}
            {row("Machine type", true, <select name="type" defaultValue="zkteco" className="input"><option value="zkteco">ZKTeco (K40, K50, F18, iClock, MB…)</option></select>)}
            {row("Integration method", false, <p className="text-sm">{push ? "Push" : "Pull"} <span className="block text-xs text-muted">Set automatically from the deployment mode below.</span></p>)}

            {section(Network, "Connection configuration")}
            {row("Machine IP", !push, <input name="host" required={!push} defaultValue={m?.host ?? ""} placeholder="Public IP, e.g. 154.57.213.75" className="input font-mono" />, "Used only for pull (direct) machines. The office router must forward this port to the machine.")}
            {row("Machine port", !push, <input name="port" type="number" defaultValue={m?.port ?? 4370} className="input w-32" />)}

            {section(Route, "Integration routing")}
            {row("Deployment mode", true, (
              <select name="mode" defaultValue={push ? "push" : "pull"} className="input">
                <option value="pull">Direct: AMS connects to the machine (like ResourceInn)</option>
                <option value="push">Cloud Server: the machine sends to AMS</option>
              </select>
            ), "Direct works alongside ResourceInn: AMS only reads punches and changes nothing on the machine.")}

            {section(KeyRound, "Authentication")}
            <label className="flex items-center gap-3 py-2 text-sm font-medium">
              <input type="checkbox" name="requiresAuth" defaultChecked={m?.requiresAuth || !!m?.commKeyEnc} className="peer size-4 accent-navy-900" /> Machine requires authentication
              <span className="hidden text-xs font-normal text-muted sm:inline">(a Comm Key / Comm Password is set on the machine)</span>
            </label>
            {row("Comm Key", false, <input name="commKey" inputMode="numeric" autoComplete="off" placeholder={m?.commKeyEnc ? "•••••• (saved, type to change)" : "Numbers only, e.g. 123456"} className="input w-56" />, "Only when the box above is ticked. Read it on the machine: Menu → Comm. → Connection (or Security) → Comm Key. Unticked = no password (key 0), like ResourceInn.")}
          </div>
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3">
            <Link href="/hr/attendance/machines" scroll={false} className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm hover:bg-canvas">Cancel</Link>
            <SubmitButton>{push ? "Save" : "Save & test connection"}</SubmitButton>
          </footer>
        </ActionForm>
      </div>
    </div>
  );
}
