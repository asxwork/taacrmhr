import Link from "@/components/link";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { ArrowRight, Boxes, Handshake, Laptop, Plus, Search, Tag, Trash2 } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { assetTypes } from "@/lib/asset-types";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm-shared";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { assetAction, deleteAsset, saveAsset, saveAssetType } from "./actions";

export const metadata = { title: "Assets" };
const TONE = { available: "green", assigned: "navy", repair: "amber", retired: "neutral" } as const;
const LOG_LABEL: Record<string, string> = { added: "Added to register", assigned: "Assigned to", returned: "Returned by", repair: "Sent for repair", retired: "Retired", available: "Back in stock" };
type SP = { tab?: string; holder?: string; t?: string; status?: string; category?: string; q?: string; a?: string; new?: string; edit?: string };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.assets");
  const sp = await searchParams;
  const canEdit = can(user, "hr.assets", "edit");
  const tab = sp.tab === "allocations" ? "allocations" : sp.tab === "types" ? "types" : "assets";
  const where: Prisma.AssetWhereInput = {
    ...(sp.status && { status: sp.status }),
    ...(sp.holder && { assignedToId: sp.holder }),
    ...(sp.t && { tags: { contains: sp.t } }),
    ...(sp.category && { category: sp.category }),
    ...(sp.q && { OR: [{ tag: { contains: sp.q } }, { name: { contains: sp.q } }, { serial: { contains: sp.q } }, { assignedTo: { fullName: { contains: sp.q } } }] }),
  };
  const [assets, counts, types, holders, allTags, byType] = await Promise.all([
    db.asset.findMany({ where, include: { assignedTo: { select: { id: true, fullName: true, code: true, photo: true } } }, orderBy: { tag: "asc" } }),
    db.asset.groupBy({ by: ["status"], _count: true }),
    assetTypes(),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }),
    db.asset.findMany({ where: { tags: { not: null } }, select: { tags: true } }),
    db.asset.groupBy({ by: ["category", "status"], _count: true }),
  ]);
  const tagList = [...new Set(allTags.flatMap((a) => a.tags!.split(",")).filter(Boolean))].sort();
  const holder = sp.holder ? holders.find((h) => h.id === sp.holder) : null;
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ tab: sp.tab, status: sp.status, category: sp.category, q: sp.q, holder: sp.holder, t: sp.t, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/hr/assets${p.size ? `?${p}` : ""}`;
  };
  const base = qs({});

  const open = sp.a ? await db.asset.findUnique({ where: { id: sp.a }, include: { assignedTo: true, logs: { orderBy: { createdAt: "desc" } } } }) : null;
  const editing = sp.new ? null : sp.edit ? open : undefined;
  const [employees, people] = await Promise.all([
    (open?.status === "available" || sp.holder) && canEdit ? db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }) : [],
    open ? db.user.findMany({ where: { id: { in: open.logs.map((l) => l.byId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [],
  ]);
  const logEmps = open ? Object.fromEntries((await db.employee.findMany({ where: { id: { in: open.logs.map((l) => l.employeeId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } })).map((e) => [e.id, e.fullName])) : {};
  // Allocations: every hand-over, with the date it came back (the next log on that asset).
  const allocations = tab === "allocations" ? await (async () => {
    const logs = await db.assetLog.findMany({ where: { action: { in: ["assigned", "returned", "repair", "retired", "available"] }, ...(sp.holder && { employeeId: sp.holder }) }, include: { asset: { select: { id: true, tag: true, name: true, category: true, serial: true } } }, orderBy: { createdAt: "asc" }, take: 2000 });
    const all = sp.holder ? await db.assetLog.findMany({ where: { assetId: { in: [...new Set(logs.map((l) => l.assetId))] } }, orderBy: { createdAt: "asc" } }) : logs;
    const emps = new Map((await db.employee.findMany({ where: { id: { in: logs.map((l) => l.employeeId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true, code: true, photo: true } })).map((e) => [e.id, e]));
    return logs.filter((l) => l.action === "assigned").map((l) => {
      const back = all.find((x) => x.assetId === l.assetId && x.createdAt > l.createdAt && x.action !== "assigned");
      return { id: l.id, asset: l.asset, emp: l.employeeId ? emps.get(l.employeeId) : undefined, from: l.createdAt, to: back?.createdAt ?? null, note: l.note };
    }).reverse();
  })() : [];
  let nextTag = "AST-0001";
  if (sp.new) {
    const tags = await db.asset.findMany({ where: { tag: { startsWith: "AST-" } }, select: { tag: true } });
    nextTag = `AST-${String(tags.reduce((m, t) => Math.max(m, Number(t.tag.slice(4)) || 0), 0) + 1).padStart(4, "0")}`;
  }

  const tabHref = (t: string) => qs({ tab: t === "assets" ? undefined : t, status: undefined, category: undefined, t: undefined, q: undefined });
  const typeCount = (c: string, st?: string) => byType.filter((r) => r.category === c && (!st || r.status === st)).reduce((n, r) => n + r._count, 0);

  return (
    <>
      <PageHeader
        title="Assets"
        description="Company equipment, who has it, and its full hand-over history."
        actions={can(user, "hr.assets", "create") && tab !== "types" && <LinkButton href={`${base}${base.includes("?") ? "&" : "?"}new=1`} scroll={false}><Plus className="size-4" /> Add asset</LinkButton>}
      />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-black/5 p-1 sm:w-fit">
        {([["assets", "Company assets", Laptop], ["allocations", "Allocations", Handshake], ["types", "Asset types", Boxes]] as const).map(([t, label, Icon]) => (
          <Link key={t} href={tabHref(t)} className={cn("flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm transition", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </div>

      {holder && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 border-navy-900/20 bg-navy-900/[0.03] p-4">
          <span className="text-sm">Showing <b>{holder.fullName}</b>’s {tab === "allocations" ? "allocation history" : "assets"} ({holder.code}).</span>
          {canEdit && tab === "assets" && assets.length === 0 && <span className="text-sm text-muted">Nothing assigned yet: open an available asset below to give it.</span>}
          <Link href={qs({ holder: undefined })} className="ml-auto text-sm font-medium text-navy-900 hover:underline">Show everyone</Link>
        </Card>
      )}

      {tab === "types" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Available</th><th className="px-4 py-2.5 text-right">Assigned</th>{canEdit && <th className="px-4 py-2.5" />}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {types.map((c, i) => (
                  <tr key={c} className="hover:bg-canvas/60">
                    <td className="px-4 py-3"><span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-xs text-muted">ATP-{String(i + 1).padStart(3, "0")}</span></td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <ActionForm action={saveAssetType} className="flex items-center gap-2">
                          <input type="hidden" name="op" value="rename" /><input type="hidden" name="old" value={c} />
                          <input name="name" defaultValue={c} aria-label={`Rename ${c}`} className="input h-8 max-w-56" />
                          <SubmitButton variant="secondary" className="h-8 px-2 text-xs">Save</SubmitButton>
                        </ActionForm>
                      ) : <span className="font-medium">{c}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums"><Link href={qs({ tab: undefined, category: c })} className="font-medium hover:underline">{typeCount(c)}</Link></td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{typeCount(c, "available")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{typeCount(c, "assigned")}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        {c !== "Other" && (
                          <ActionForm action={saveAssetType}>
                            <input type="hidden" name="op" value="remove" /><input type="hidden" name="old" value={c} />
                            <button aria-label={`Remove ${c}`} title="Remove" className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button>
                          </ActionForm>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {canEdit && (
            <Card className="h-fit p-4">
              <p className="mb-1 font-medium">Add a type</p>
              <p className="mb-3 text-xs text-muted">e.g. Monitor, Headset, Printer, Camera. Renaming a type moves its assets with it.</p>
              <ActionForm action={saveAssetType} className="space-y-3">
                <input type="hidden" name="op" value="add" />
                <input name="name" required placeholder="Type name" className="input" />
                <SubmitButton>Add type</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      ) : tab === "allocations" ? (
        <>
          <AutoFilterForm className="mb-3 flex flex-wrap gap-2">
            <input type="hidden" name="tab" value="allocations" />
            <select name="holder" defaultValue={sp.holder ?? ""} aria-label="Employee" className="input w-64"><option value="">All employees</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.fullName} ({h.code})</option>)}</select>
          </AutoFilterForm>
          <Card className="overflow-hidden">
            {allocations.length === 0 ? <EmptyState title="No allocations yet" description="Assign an asset to someone and it shows here, with the return date when it comes back." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                    <tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Allocated</th><th className="px-4 py-2.5">Returned</th><th className="px-4 py-2.5">Held for</th><th className="px-4 py-2.5">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {allocations.map((r) => {
                      const days = Math.max(0, Math.round(((r.to ?? new Date()).getTime() - r.from.getTime()) / 86_400_000));
                      return (
                        <tr key={r.id} className="hover:bg-canvas/60">
                          <td className="px-4 py-3">
                            {r.emp ? (
                              <Link href={qs({ holder: r.emp.id })} className="flex items-center gap-3">
                                <PersonAvatar name={r.emp.fullName} photo={r.emp.photo} className="size-9" />
                                <span><span className="block font-medium hover:underline">{r.emp.fullName}</span><span className="block text-xs text-muted">{r.emp.code}</span></span>
                              </Link>
                            ) : <span className="text-muted">Former employee</span>}
                          </td>
                          <td className="px-4 py-3"><Link href={qs({ tab: undefined, a: r.asset.id })} scroll={false} className="font-medium hover:underline">{r.asset.name}</Link><span className="block text-xs text-muted">{r.asset.tag} · {r.asset.category}{r.asset.serial ? ` · ${r.asset.serial}` : ""}</span></td>
                          <td className="whitespace-nowrap px-4 py-3">{fmtDate(r.from)}</td>
                          <td className="whitespace-nowrap px-4 py-3">{r.to ? fmtDate(r.to) : <span className="text-muted">—</span>}</td>
                          <td className="px-4 py-3 tabular-nums text-muted">{days} day{days === 1 ? "" : "s"}</td>
                          <td className="px-4 py-3"><Badge tone={r.to ? "neutral" : "green"}>{r.to ? "Returned" : "Allocated"}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
      <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["available", "assigned", "repair", "retired"] as const).map((s) => (
          <Link key={s} href={qs({ status: sp.status === s ? undefined : s })}>
            <Card className={cn("p-4 transition hover:-translate-y-0.5 hover:shadow-md", sp.status === s && "border-navy-900 ring-1 ring-navy-900")}>
              <p className="flex items-center gap-1.5 text-xs capitalize text-muted"><span className={cn("size-2 rounded-full", { available: "bg-emerald-500", assigned: "bg-navy-900", repair: "bg-amber-500", retired: "bg-slate-400" }[s])} />{s === "repair" ? "In repair" : s}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{count(s)}</p>
            </Card>
          </Link>
        ))}
      </div>
      <AutoFilterForm className="mb-3 flex flex-wrap gap-2">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Search tag, name, serial or holder" className="input pl-9" />
        </label>
        <select name="category" defaultValue={sp.category ?? ""} aria-label="Type" className="input w-auto"><option value="">All types</option>{types.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="holder" defaultValue={sp.holder ?? ""} aria-label="Employee" className="input w-auto max-w-56"><option value="">Any holder</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.fullName}</option>)}</select>
        {tagList.length > 0 && <select name="t" defaultValue={sp.t ?? ""} aria-label="Tag" className="input w-auto"><option value="">Any tag</option>{tagList.map((t) => <option key={t}>{t}</option>)}</select>}
      </AutoFilterForm>

      <Card className="overflow-hidden">
        {assets.length === 0 ? <EmptyState title="No assets" description={sp.q || sp.status || sp.category || sp.holder || sp.t ? "Nothing matches these filters." : "Add laptops, phones, SIMs and other equipment to track who has them."} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Tags</th><th className="px-4 py-2.5">Holder</th><th className="px-4 py-2.5">Status</th><th className="w-8" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {assets.map((a) => {
                  const href = `${base}${base.includes("?") ? "&" : "?"}a=${a.id}`;
                  return (
                    <tr key={a.id} className="group hover:bg-canvas/60">
                      <td className="px-4 py-3"><span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-xs text-muted">{a.tag}</span></td>
                      <td className="px-4 py-3"><Link href={href} scroll={false} className="block font-medium hover:underline">{a.name}</Link>{a.serial && <span className="block text-xs text-muted">S/N {a.serial}</span>}</td>
                      <td className="px-4 py-3 text-muted">{a.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">{a.tags ? a.tags.split(",").map((t) => <Link key={t} href={qs({ t })} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800 hover:bg-sky-100"><Tag className="size-3" />{t}</Link>) : <span className="text-muted">—</span>}</div>
                      </td>
                      <td className="px-4 py-3">
                        {a.assignedTo ? (
                          <Link href={qs({ holder: a.assignedTo.id })} className="flex items-center gap-2"><PersonAvatar name={a.assignedTo.fullName} photo={a.assignedTo.photo} className="size-7 text-[10px]" /><span className="hover:underline">{a.assignedTo.fullName}</span></Link>
                        ) : <span className="text-muted">In stock</span>}
                      </td>
                      <td className="px-4 py-3"><Badge tone={TONE[a.status as keyof typeof TONE] ?? "neutral"}>{a.status}</Badge></td>
                      <td className="px-2 py-3"><Link href={href} scroll={false} aria-label={`Open ${a.name}`} className="text-muted group-hover:text-ink"><ArrowRight className="size-4" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>
      )}

      {editing !== undefined && can(user, "hr.assets", editing ? "edit" : "create") && (
        <Drawer title={editing ? `Edit ${editing.tag}` : "Add asset"} closeHref={editing ? `${base}${base.includes("?") ? "&" : "?"}a=${editing.id}` : base}>
          <ActionForm action={saveAsset} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Field label="Tag"><input name="tag" required defaultValue={editing?.tag ?? nextTag} className="input uppercase" /></Field>
              <Field label="Name"><input name="name" required defaultValue={editing?.name} className="input" placeholder="e.g. Dell Latitude 5440" autoFocus /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category"><select name="category" defaultValue={editing?.category ?? "Laptop"} className="input">{types.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Serial / IMEI / number"><input name="serial" defaultValue={editing?.serial ?? ""} className="input" /></Field>
            </div>
            <Field label="Tags" hint="Comma-separated, e.g. new, 16GB, 2nd floor"><input name="tags" defaultValue={editing?.tags?.split(",").join(", ") ?? ""} className="input" placeholder="new, 16GB" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cost (PKR)"><input name="cost" inputMode="decimal" defaultValue={editing?.cost ?? ""} className="input" /></Field>
              <Field label="Purchased"><input name="purchasedAt" type="date" defaultValue={editing?.purchasedAt ? format(editing.purchasedAt, "yyyy-MM-dd") : ""} className="input" /></Field>
            </div>
            <Field label="Notes"><textarea name="notes" rows={3} defaultValue={editing?.notes ?? ""} className="input" /></Field>
            <SubmitButton>{editing ? "Save" : "Add asset"}</SubmitButton>
          </ActionForm>
        </Drawer>
      )}

      {open && editing === undefined && (
        <Drawer title={`${open.tag} · ${open.name}`} closeHref={base}>
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[open.status as keyof typeof TONE] ?? "neutral"}>{open.status}</Badge>
              {open.assignedTo && <span className="text-sm">with <Link href={`/hr/employees/${open.assignedTo.id}`} className="font-medium hover:underline">{open.assignedTo.fullName}</Link> since {fmtDate(open.assignedAt)}</span>}
              {canEdit && <Link href={`${base}${base.includes("?") ? "&" : "?"}a=${open.id}&edit=1`} scroll={false} className="ml-auto text-sm font-medium text-navy-900 hover:underline">Edit</Link>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {([["Type", open.category], ["Tags", open.tags?.split(",").join(", ") || null], ["Serial", open.serial], ["Cost", open.cost ? fmtPKR(open.cost) : null], ["Purchased", open.purchasedAt ? fmtDate(open.purchasedAt) : null]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{v ?? "—"}</dd></div>
              ))}
              {open.notes && <div className="col-span-2"><dt className="text-xs text-muted">Notes</dt><dd className="whitespace-pre-wrap">{open.notes}</dd></div>}
            </dl>

            {canEdit && open.status === "available" && (
              <ActionForm action={assetAction} className="space-y-3 rounded-lg border border-line p-4">
                <p className="text-sm font-medium">Assign</p>
                <input type="hidden" name="id" value={open.id} />
                <input type="hidden" name="action" value="assign" />
                <select name="employeeId" required className="input" defaultValue={sp.holder ?? ""}><option value="" disabled>Choose employee…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}</select>
                <input name="note" className="input" placeholder="Note, e.g. condition or accessories (charger, bag)" />
                <SubmitButton>Assign</SubmitButton>
              </ActionForm>
            )}
            {canEdit && open.status !== "retired" && (
              <ActionForm action={assetAction} className="space-y-3 rounded-lg border border-line p-4">
                <p className="text-sm font-medium">{open.status === "assigned" ? "Take back" : "Change status"}</p>
                <input type="hidden" name="id" value={open.id} />
                <select name="action" className="input">
                  {open.status === "assigned" && <option value="return">Return to stock</option>}
                  {open.status === "repair" && <option value="available">Back in stock</option>}
                  {open.status !== "repair" && <option value="repair">Send for repair</option>}
                  <option value="retire">Retire</option>
                </select>
                <input name="note" className="input" placeholder="Note (optional), e.g. condition on return" />
                <SubmitButton>Update</SubmitButton>
              </ActionForm>
            )}
            {canEdit && open.status === "retired" && (
              <ActionForm action={assetAction}>
                <input type="hidden" name="id" value={open.id} />
                <input type="hidden" name="action" value="available" />
                <SubmitButton variant="secondary">Put back in stock</SubmitButton>
              </ActionForm>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">History</p>
              <ol className="space-y-2 border-l border-line pl-4 text-sm">
                {open.logs.map((l) => (
                  <li key={l.id}>
                    <span className="font-medium">{LOG_LABEL[l.action] ?? l.action}{l.employeeId && ["assigned", "returned"].includes(l.action) ? ` ${logEmps[l.employeeId] ?? "former employee"}` : ""}</span>
                    {l.note && <span className="text-muted"> — {l.note}</span>}
                    <span className="block text-xs text-muted">{fmtDateTime(l.createdAt)}{l.byId ? ` · ${people.find((p) => p.id === l.byId)?.name ?? ""}` : ""}</span>
                  </li>
                ))}
              </ol>
            </div>
            {can(user, "hr.assets", "delete") && open.status !== "assigned" && (
              <form action={deleteAsset} className="border-t border-line pt-4">
                <input type="hidden" name="id" value={open.id} />
                <button className="text-sm text-red-600 hover:underline">Delete from register</button>
              </form>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}
