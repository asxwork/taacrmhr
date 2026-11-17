import Link from "@/components/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { subDays } from "date-fns";
import { Flame, MapPin, Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeWhere } from "@/lib/permissions";
import { areaWhere, pkRange, pkShort, unitWhere } from "@/lib/inventory";
import { Badge, Card, Drawer, EmptyState, PageHeader } from "@/components/ui";
import { StatusPill } from "@/components/crm/bits";
import { AreaForm } from "../../catalog-forms";
import { deleteArea } from "../../catalog-actions";

export const metadata = { title: "Area" };

/**
 * Inventory → Area (targeting): free stock by type and price, the projects there, and the leads who asked for this
 * area in the last 90 days, so agents can call them with the right units.
 */
export default async function AreaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await db.inventoryArea.findUnique({ where: { id } });
  if (!a) notFound();
  const visible = (await unitWhere(user, "view")) ?? { id: "" };
  const canEdit = user.isSuperAdmin || can(user, "inventory.projects", "edit") || can(user, "inventory.projects", "create");
  const since = subDays(new Date(), 90);
  const leadScope = ((await scopeWhere(user, "crm.leads")) ?? { id: "" }) as Prisma.LeadWhereInput;
  const asked: Prisma.LeadWhereInput = { createdAt: { gte: since }, OR: [{ location: { contains: a.name } }, { project: { location: a.name } }] };
  const [units, projects, leads, leadCount] = await Promise.all([
    db.unit.findMany({ where: { AND: [visible, areaWhere(a.name)] }, select: { id: true, status: true, type: true, price: true, purpose: true, projectId: true } }),
    db.project.findMany({ where: { location: a.name }, select: { id: true, name: true, developer: true, status: true }, orderBy: { name: "asc" } }),
    db.lead.findMany({ where: { AND: [can(user, "crm.leads") ? leadScope : { id: "" }, asked] }, include: { status: true, owner: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.lead.count({ where: asked }),
  ]);
  const free = units.filter((u) => u.status === "available");
  const types = [...new Set(free.map((u) => u.type))].map((t) => {
    const us = free.filter((u) => u.type === t), ps = us.map((u) => u.price).filter((x): x is number => !!x);
    return { t, n: us.length, rent: us.filter((u) => u.purpose === "rent").length, min: ps.length ? Math.min(...ps) : null, max: ps.length ? Math.max(...ps) : null };
  }).sort((x, y) => y.n - x.n);
  const value = free.reduce((s, u) => s + (u.price ?? 0), 0);
  const hot = leadCount > free.length && leadCount > 0;
  const enc = encodeURIComponent(a.name);

  return (
    <>
      <PageHeader eyebrow={`Area · ${a.city}`} title={a.name} description={`${units.length} units · ${projects.length} project${projects.length === 1 ? "" : "s"}`} actions={canEdit && (
        <>
          <Link href={`/inventory/areas/${a.id}?edit=1`} scroll={false} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-canvas"><Pencil className="size-4" /> Edit</Link>
          {units.length === 0 && projects.length === 0 && <form action={deleteArea}><input type="hidden" name="id" value={a.id} /><button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm text-red-600 hover:bg-red-50"><Trash2 className="size-4" /> Delete</button></form>}
        </>
      )} />
      {a.notes && <Card className="mb-5 whitespace-pre-line p-4 text-sm">{a.notes}</Card>}

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href={`/inventory?area=${enc}&status=available`} className="rounded-xl bg-surface p-4 ring-1 ring-line hover:ring-navy-900/30"><dt className="text-xs uppercase tracking-wide text-muted">Free units</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{free.length}</dd></Link>
        <div className="rounded-xl bg-surface p-4 ring-1 ring-line"><dt className="text-xs uppercase tracking-wide text-muted">Free stock value</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{value ? `PKR ${pkShort(value)}` : "—"}</dd></div>
        <div className="rounded-xl bg-surface p-4 ring-1 ring-line"><dt className="text-xs uppercase tracking-wide text-muted">Leads · 90 days</dt><dd className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums">{leadCount}{hot && <Badge tone="amber"><Flame className="mr-1 inline size-3" />Hot</Badge>}</dd></div>
        <div className="rounded-xl bg-surface p-4 ring-1 ring-line"><dt className="text-xs uppercase tracking-wide text-muted">Booked / sold</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{units.filter((u) => ["booked", "sold"].includes(u.status)).length}</dd></div>
      </dl>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Free stock by type</h2>
          {types.length === 0 ? <EmptyState title="Nothing free here right now" /> : (
            <table className="w-full text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Free</th><th className="px-4 py-2">Price</th><th className="px-4 py-2" /></tr></thead>
              <tbody className="divide-y divide-line">
                {types.map((r) => (
                  <tr key={r.t}>
                    <td className="px-4 py-2.5 font-medium">{r.t}{r.rent ? <span className="ml-1.5 text-xs font-normal text-muted">{r.rent} for rent</span> : null}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.n}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted">{pkRange(r.min, r.max)}</td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/inventory?area=${enc}&status=available&type=${encodeURIComponent(r.t)}`} className="text-xs font-medium hover:underline">See units</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Projects here</h2>
          {projects.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No projects set to this area. Resale and rental listings still count.</p> : (
            <ul className="divide-y divide-line">
              {projects.map((p) => {
                const n = units.filter((u) => u.projectId === p.id), f = n.filter((u) => u.status === "available").length;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <Link href={`/inventory/projects/${p.id}`} className="min-w-0 truncate font-medium hover:underline">{p.name}<span className="ml-2 text-xs font-normal text-muted">{p.developer ?? ""}</span></Link>
                    <span className="shrink-0 text-xs text-muted"><b className="text-ink">{f}</b>/{n.length} free</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold"><MapPin className="size-4 text-muted" /> Leads who asked for {a.name} (last 90 days)</h2>
        {leads.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No recent leads for this area{can(user, "crm.leads") ? "" : " that you can see"}.</p> : (
          <ul className="divide-y divide-line">
            {leads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <Link href={`/crm/leads/${l.id}`} className="min-w-40 flex-1 font-medium hover:underline">{l.name}</Link>
                <span className="text-xs text-muted">{[l.propertyType, l.budgetMax ? `up to ${pkShort(l.budgetMax)}` : null].filter(Boolean).join(" · ")}</span>
                <StatusPill name={l.status.name} colorName={l.status.color} />
                <span className="w-28 truncate text-xs text-muted">{l.owner?.name ?? "Unassigned"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sp.edit && canEdit && <Drawer title={`Edit ${a.name}`} closeHref={`/inventory/areas/${a.id}`}><AreaForm a={a} /></Drawer>}
    </>
  );
}
