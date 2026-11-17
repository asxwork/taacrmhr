import Link from "@/components/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { subDays } from "date-fns";
import { Building2, Globe, Mail, Pencil, Phone, Trash2, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeWhere } from "@/lib/permissions";
import { color } from "@/lib/crm";
import { UNIT_STATUSES, pkRange, pkShort, unitWhere } from "@/lib/inventory";
import { telHref } from "@/lib/crm-shared";
import { fileUrl } from "@/lib/files";
import { Badge, Card, Drawer, EmptyState, PageHeader } from "@/components/ui";
import { SafeImg } from "@/components/safe-img";
import { StatusPill } from "@/components/crm/bits";
import { DeveloperForm } from "../../catalog-forms";
import { deleteDeveloper } from "../../catalog-actions";

export const metadata = { title: "Developer" };

/** Inventory → Developer: contact details, their projects with stock and prices, and recent lead demand. */
export default async function DeveloperPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await db.developer.findUnique({ where: { id } });
  if (!d) notFound();
  const visible = (await unitWhere(user, "view")) ?? { id: "" };
  const canEdit = user.isSuperAdmin || can(user, "inventory.projects", "edit") || can(user, "inventory.projects", "create");
  const projects = await db.project.findMany({ where: { developer: d.name }, include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } }, orderBy: { name: "asc" } });
  const ids = projects.map((p) => p.id);
  const since = subDays(new Date(), 90);
  const leadScope = ((await scopeWhere(user, "crm.leads")) ?? { id: "" }) as Prisma.LeadWhereInput;
  const [byStatus, avail, leads, leadCount] = await Promise.all([
    db.unit.groupBy({ by: ["projectId", "status"], where: { AND: [visible, { projectId: { in: ids } }] }, _count: true }),
    db.unit.groupBy({ by: ["projectId"], where: { AND: [visible, { projectId: { in: ids }, status: "available" }] }, _sum: { price: true }, _min: { price: true }, _max: { price: true } }),
    db.lead.findMany({ where: { AND: [can(user, "crm.leads") ? leadScope : { id: "" }, { projectId: { in: ids }, createdAt: { gte: since } }] }, include: { status: true, owner: { select: { name: true } }, project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.lead.count({ where: { projectId: { in: ids }, createdAt: { gte: since } } }),
  ]);
  const total = byStatus.reduce((a, r) => a + r._count, 0);
  const free = byStatus.filter((r) => r.status === "available").reduce((a, r) => a + r._count, 0);
  const moved = byStatus.filter((r) => ["booked", "sold"].includes(r.status)).reduce((a, r) => a + r._count, 0);
  const value = avail.reduce((a, r) => a + (r._sum.price ?? 0), 0);
  const mins = avail.map((r) => r._min.price).filter((x): x is number => !!x), maxs = avail.map((r) => r._max.price).filter((x): x is number => !!x);

  return (
    <>
      <PageHeader eyebrow="Developer" title={d.name} description={`${projects.length} project${projects.length === 1 ? "" : "s"} · ${total} units`} actions={canEdit && (
        <>
          <Link href={`/inventory/developers/${d.id}?edit=1`} scroll={false} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-canvas"><Pencil className="size-4" /> Edit</Link>
          {projects.length === 0 && <form action={deleteDeveloper}><input type="hidden" name="id" value={d.id} /><button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm text-red-600 hover:bg-red-50"><Trash2 className="size-4" /> Delete</button></form>}
        </>
      )} />

      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        {d.contactName && <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 ring-1 ring-line"><User className="size-4 text-muted" />{d.contactName}</span>}
        {d.phone && <a href={telHref(d.phone)} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 ring-1 ring-line hover:bg-canvas"><Phone className="size-4 text-muted" />{d.phone}</a>}
        {d.email && <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 ring-1 ring-line hover:bg-canvas"><Mail className="size-4 text-muted" />{d.email}</a>}
        {d.website && <a href={d.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 ring-1 ring-line hover:bg-canvas"><Globe className="size-4 text-muted" />{d.website.replace(/^https?:\/\//, "")}</a>}
        {!d.contactName && !d.phone && !d.email && canEdit && <Link href={`/inventory/developers/${d.id}?edit=1`} scroll={false} className="text-muted underline">Add contact details</Link>}
      </div>
      {d.notes && <Card className="mb-5 whitespace-pre-line p-4 text-sm">{d.notes}</Card>}

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([["Available units", free, `/inventory?developer=${encodeURIComponent(d.name)}&status=available`], ["Booked / sold", `${moved} (${total ? Math.round((moved / total) * 100) : 0}%)`, null], ["Stock value", value ? `PKR ${pkShort(value)}` : "—", null], ["Price range", pkRange(mins.length ? Math.min(...mins) : null, maxs.length ? Math.max(...maxs) : null), null], ["Leads · 90 days", leadCount, null]] as const).map(([k, v, href]) => {
          const inner = <><dt className="text-xs uppercase tracking-wide text-muted">{k}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd></>;
          return href ? <Link key={k} href={href} className="rounded-xl bg-surface p-4 ring-1 ring-line hover:ring-navy-900/30">{inner}</Link> : <div key={k} className="rounded-xl bg-surface p-4 ring-1 ring-line">{inner}</div>;
        })}
      </dl>

      <h2 className="mb-3 text-sm font-semibold">Projects</h2>
      {projects.length === 0 ? <Card className="mb-6"><EmptyState title="No projects yet" description={`Pick “${d.name}” as the developer when adding a project.`} /></Card> : (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const rows = byStatus.filter((r) => r.projectId === p.id);
            const n = rows.reduce((a, r) => a + r._count, 0);
            const a = avail.find((r) => r.projectId === p.id);
            return (
              <Link key={p.id} href={`/inventory/projects/${p.id}`}>
                <Card className="h-full overflow-hidden transition hover:border-navy-900/20">
                  {p.images[0] ? <SafeImg src={fileUrl(p.images[0].path, 600)} alt="" className="aspect-[16/7] w-full object-cover" loading="lazy" /> : <div className="flex aspect-[16/7] items-center justify-center bg-canvas text-muted/40"><Building2 className="size-8" /></div>}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2"><p className="font-medium">{p.name}</p><Badge tone={p.status === "active" ? "green" : "neutral"}>{p.status}</Badge></div>
                    <p className="text-xs text-muted">{[p.location, p.city].filter(Boolean).join(", ")}</p>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-canvas">{n > 0 && UNIT_STATUSES.map((s) => { const c = rows.find((r) => r.status === s.value)?._count ?? 0; return c ? <span key={s.value} className={color(s.color).bar} style={{ width: `${(c / n) * 100}%` }} title={`${s.label}: ${c}`} /> : null; })}</div>
                    <p className="mt-2 text-xs text-muted"><b className="text-ink">{rows.find((r) => r.status === "available")?._count ?? 0}</b>/{n} free · {pkRange(a?._min.price, a?._max.price)}</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {leads.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold">Recent leads for these projects</h2>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <Link href={`/crm/leads/${l.id}`} className="min-w-40 flex-1 font-medium hover:underline">{l.name}</Link>
                  <span className="text-xs text-muted">{l.project?.name}</span>
                  <StatusPill name={l.status.name} colorName={l.status.color} />
                  <span className="w-28 truncate text-xs text-muted">{l.owner?.name ?? "Unassigned"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {sp.edit && canEdit && <Drawer title={`Edit ${d.name}`} closeHref={`/inventory/developers/${d.id}`}><DeveloperForm d={d} /></Drawer>}
    </>
  );
}
