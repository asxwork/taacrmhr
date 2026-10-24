import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm-shared";
import { ASSET_CATEGORIES } from "@/lib/hr-shared";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { assetAction, deleteAsset, saveAsset } from "./actions";

export const metadata = { title: "Assets" };
const TONE = { available: "green", assigned: "navy", repair: "amber", retired: "neutral" } as const;
const LOG_LABEL: Record<string, string> = { added: "Added to register", assigned: "Assigned to", returned: "Returned by", repair: "Sent for repair", retired: "Retired", available: "Back in stock" };
type SP = { status?: string; category?: string; q?: string; a?: string; new?: string; edit?: string };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.assets");
  const sp = await searchParams;
  const canEdit = can(user, "hr.assets", "edit");
  const where: Prisma.AssetWhereInput = {
    ...(sp.status && { status: sp.status }),
    ...(sp.category && { category: sp.category }),
    ...(sp.q && { OR: [{ tag: { contains: sp.q } }, { name: { contains: sp.q } }, { serial: { contains: sp.q } }, { assignedTo: { fullName: { contains: sp.q } } }] }),
  };
  const [assets, counts] = await Promise.all([
    db.asset.findMany({ where, include: { assignedTo: { select: { id: true, fullName: true } } }, orderBy: { tag: "asc" } }),
    db.asset.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ status: sp.status, category: sp.category, q: sp.q, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/hr/assets${p.size ? `?${p}` : ""}`;
  };
  const base = qs({});

  const open = sp.a ? await db.asset.findUnique({ where: { id: sp.a }, include: { assignedTo: true, logs: { orderBy: { createdAt: "desc" } } } }) : null;
  const editing = sp.new ? null : sp.edit ? open : undefined;
  const [employees, people] = await Promise.all([
    open?.status === "available" && canEdit ? db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }) : [],
    open ? db.user.findMany({ where: { id: { in: open.logs.map((l) => l.byId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [],
  ]);
  const logEmps = open ? Object.fromEntries((await db.employee.findMany({ where: { id: { in: open.logs.map((l) => l.employeeId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } })).map((e) => [e.id, e.fullName])) : {};
  let nextTag = "AST-0001";
  if (sp.new) {
    const tags = await db.asset.findMany({ where: { tag: { startsWith: "AST-" } }, select: { tag: true } });
    nextTag = `AST-${String(tags.reduce((m, t) => Math.max(m, Number(t.tag.slice(4)) || 0), 0) + 1).padStart(4, "0")}`;
  }

  return (
    <>
      <PageHeader
        title="Assets"
        description="Company equipment and who has it."
        actions={can(user, "hr.assets", "create") && <LinkButton href={`${base}${base.includes("?") ? "&" : "?"}new=1`} scroll={false}><Plus className="size-4" /> Add asset</LinkButton>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["available", "assigned", "repair", "retired"] as const).map((s) => (
          <Link key={s} href={qs({ status: sp.status === s ? undefined : s })}>
            <Card className={cn("p-4 transition hover:border-navy-900/20", sp.status === s && "border-navy-900")}>
              <p className="text-xs capitalize text-muted">{s === "repair" ? "In repair" : s}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{count(s)}</p>
            </Card>
          </Link>
        ))}
      </div>
      <form className="mb-3 flex flex-wrap gap-2">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Search tag, name, serial or holder" className="input pl-9" />
        </label>
        <select name="category" defaultValue={sp.category ?? ""} className="input w-auto"><option value="">All categories</option>{ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <button className={buttonClass("secondary")}>Filter</button>
      </form>

      <Card className="overflow-hidden">
        {assets.length === 0 ? <EmptyState title="No assets" description={sp.q || sp.status || sp.category ? "Nothing matches these filters." : "Add laptops, phones, SIMs and other equipment to track who has them."} /> : (
          <ul className="divide-y divide-line">
            {assets.map((a) => (
              <li key={a.id}>
                <Link href={`${base}${base.includes("?") ? "&" : "?"}a=${a.id}`} scroll={false} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-canvas/60">
                  <span className="w-24 font-mono text-xs text-muted">{a.tag}</span>
                  <span className="min-w-0 flex-1"><span className="block font-medium">{a.name}</span><span className="block text-xs text-muted">{a.category}{a.serial ? ` · S/N ${a.serial}` : ""}</span></span>
                  <span className="w-44 truncate text-sm">{a.assignedTo ? a.assignedTo.fullName : <span className="text-muted">—</span>}</span>
                  <Badge tone={TONE[a.status as keyof typeof TONE] ?? "neutral"}>{a.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing !== undefined && can(user, "hr.assets", editing ? "edit" : "create") && (
        <Drawer title={editing ? `Edit ${editing.tag}` : "Add asset"} closeHref={editing ? `${base}${base.includes("?") ? "&" : "?"}a=${editing.id}` : base}>
          <ActionForm action={saveAsset} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Field label="Tag"><input name="tag" required defaultValue={editing?.tag ?? nextTag} className="input uppercase" /></Field>
              <Field label="Name"><input name="name" required defaultValue={editing?.name} className="input" placeholder="e.g. Dell Latitude 5440" autoFocus /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category"><select name="category" defaultValue={editing?.category ?? "Laptop"} className="input">{ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Serial / IMEI / number"><input name="serial" defaultValue={editing?.serial ?? ""} className="input" /></Field>
            </div>
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
              {([["Category", open.category], ["Serial", open.serial], ["Cost", open.cost ? fmtPKR(open.cost) : null], ["Purchased", open.purchasedAt ? fmtDate(open.purchasedAt) : null]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{v ?? "—"}</dd></div>
              ))}
              {open.notes && <div className="col-span-2"><dt className="text-xs text-muted">Notes</dt><dd className="whitespace-pre-wrap">{open.notes}</dd></div>}
            </dl>

            {canEdit && open.status === "available" && (
              <ActionForm action={assetAction} className="space-y-3 rounded-lg border border-line p-4">
                <p className="text-sm font-medium">Assign</p>
                <input type="hidden" name="id" value={open.id} />
                <input type="hidden" name="action" value="assign" />
                <select name="employeeId" required className="input" defaultValue=""><option value="" disabled>Choose employee…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}</select>
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
