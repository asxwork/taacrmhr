import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Building2, ImageOff, LayoutGrid, List, Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { assignableUsers, color, fmtPKR, parseAmount } from "@/lib/crm";
import { LISTING_TYPES, UNIT_STATUSES, UNIT_TYPES, sizeLabel, unitStatus, unitWhere } from "@/lib/inventory";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { Badge, Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Pagination, StatusPill, hrefWith } from "@/components/crm/bits";
import { ProjectForm, UnitForm } from "./forms";

export const metadata = { title: "Inventory" };

const PAGE_SIZE = 48;
type SP = {
  tab?: string; q?: string; project?: string; type?: string; status?: string; listing?: string; purpose?: string;
  min?: string; max?: string; view?: string; page?: string; new?: string;
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canProjects = can(user, "inventory.projects");
  const visible = await unitWhere(user, "view");
  if (!visible && !canProjects) redirect("/no-access");
  const tab = sp.tab === "projects" && canProjects ? "projects" : "units";
  const view = sp.view === "table" ? "table" : "grid";
  const page = Math.max(1, Number(sp.page) || 1);
  const keep = { tab: sp.tab, q: sp.q, project: sp.project, type: sp.type, status: sp.status, listing: sp.listing, purpose: sp.purpose, min: sp.min, max: sp.max, view: sp.view };
  const allowedTypes = [
    ...(can(user, "inventory.projects", "create") ? ["project"] : []),
    ...(can(user, "inventory.units", "create") ? ["resale", "rental"] : []),
  ];
  const closeHref = hrefWith("/inventory", keep, {});

  const projects = await db.project.findMany({ include: { blocks: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } });

  const newDrawer = sp.new && (sp.tab === "projects" ? can(user, "inventory.projects", "create") : allowedTypes.length > 0) && (
    <Drawer title={sp.tab === "projects" ? "New project" : "Add unit / listing"} closeHref={closeHref}>
      {sp.tab === "projects" ? (
        <ProjectForm cancelHref={closeHref} />
      ) : (
        <UnitForm projects={projects} owners={await assignableUsers(user, "inventory.units")} currentUserId={user.id} cancelHref={closeHref} allowedTypes={allowedTypes} />
      )}
    </Drawer>
  );

  const header = (
    <>
      <PageHeader
        title="Inventory"
        actions={
          <>
            {tab === "units" && (
              <div className="flex rounded-lg bg-black/5 p-0.5">
                {([["grid", LayoutGrid, "Cards"], ["table", List, "Table"]] as const).map(([v, Icon, label]) => (
                  <Link key={v} href={hrefWith("/inventory", keep, { view: v === "grid" ? undefined : v, page: undefined })} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", view === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
                    <Icon className="size-4" /> {label}
                  </Link>
                ))}
              </div>
            )}
            {(tab === "projects" ? can(user, "inventory.projects", "create") : allowedTypes.length > 0) && (
              <LinkButton href={hrefWith("/inventory", keep, { new: "1" })} scroll={false}>
                <Plus className="size-4" /> {tab === "projects" ? "New project" : "Add unit"}
              </LinkButton>
            )}
          </>
        }
      />
      {canProjects && (
        <div className="mb-4 flex rounded-lg bg-black/5 p-0.5 sm:w-fit">
          {(["units", "projects"] as const).map((t) => (
            <Link key={t} href={t === "projects" ? "/inventory?tab=projects" : "/inventory"} className={cn("flex-1 rounded-md px-3 py-1.5 text-center text-sm capitalize", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
              {t}
            </Link>
          ))}
        </div>
      )}
    </>
  );

  if (tab === "projects") {
    const counts = await db.unit.groupBy({ by: ["projectId", "status"], where: { listingType: "project" }, _count: true });
    return (
      <>
        {header}
        {projects.length === 0 ? (
          <Card><EmptyState title="No projects yet" description="Create a project, add blocks, then generate its units." /></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => {
              const rows = counts.filter((c) => c.projectId === p.id);
              const total = rows.reduce((s, r) => s + r._count, 0);
              return (
                <Link key={p.id} href={`/inventory/projects/${p.id}`}>
                  <Card className="h-full p-5 transition hover:border-navy-900/20">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-sm text-muted">{[p.location, p.city].filter(Boolean).join(", ")}{p.developer ? ` · ${p.developer}` : ""}</p>
                      </div>
                      <Badge tone={p.status === "active" ? "green" : "neutral"}>{p.status}</Badge>
                    </div>
                    <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-canvas">
                      {UNIT_STATUSES.map((s) => {
                        const n = rows.find((r) => r.status === s.value)?._count ?? 0;
                        return n ? <span key={s.value} className={color(s.color).bar} style={{ width: `${(n / total) * 100}%` }} title={`${s.label}: ${n}`} /> : null;
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span><b className="font-medium text-ink">{total}</b> units · {p.blocks.length} blocks</span>
                      {UNIT_STATUSES.map((s) => {
                        const n = rows.find((r) => r.status === s.value)?._count;
                        return n ? <span key={s.value}>{s.label} {n}</span> : null;
                      })}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
        {newDrawer}
      </>
    );
  }

  const q = sp.q?.trim();
  const min = sp.min ? parseAmount(sp.min) : null;
  const max = sp.max ? parseAmount(sp.max) : null;
  const where: Prisma.UnitWhereInput = {
    AND: [
      visible ?? { id: "" },
      ...(q ? [{ OR: [{ unitNo: { contains: q } }, { address: { contains: q } }, { project: { name: { contains: q } } }, { propertyOwner: { contains: q } }] }] : []),
      ...(sp.project ? [{ projectId: sp.project }] : []),
      ...(sp.type ? [{ type: sp.type }] : []),
      ...(sp.status ? [{ status: sp.status }] : []),
      ...(sp.listing ? [{ listingType: sp.listing }] : []),
      ...(sp.purpose ? [{ purpose: sp.purpose }] : []),
      ...(min != null || max != null ? [{ price: { ...(min != null && { gte: min }), ...(max != null && { lte: max }) } }] : []),
    ],
  };
  const [units, total] = await Promise.all([
    db.unit.findMany({
      where,
      include: { project: true, block: true, owner: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1 } },
      orderBy: [{ project: { name: "asc" } }, { unitNo: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.unit.count({ where }),
  ]);

  return (
    <>
      {header}
      <form className="mb-4 flex flex-wrap gap-2">
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Unit no, project, address, owner" className="input pl-9" />
        </div>
        <select name="project" defaultValue={sp.project ?? ""} className="input w-40">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className="input w-32">
          <option value="">Any type</option>
          {UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-32">
          <option value="">Any status</option>
          {UNIT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select name="listing" defaultValue={sp.listing ?? ""} className="input w-36">
          <option value="">All listings</option>
          {LISTING_TYPES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <input name="min" defaultValue={sp.min} placeholder="Min price" className="input w-28" />
        <input name="max" defaultValue={sp.max} placeholder="Max price" className="input w-28" />
        <button className="h-9 rounded-md border border-line bg-surface px-3 text-sm hover:bg-canvas">Apply</button>
      </form>

      {units.length === 0 ? (
        <Card><EmptyState title="No units match" description="Try clearing filters." /></Card>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {units.map((u) => {
            const st = unitStatus(u.status);
            return (
              <Link key={u.id} href={`/inventory/units/${u.id}`}>
                <Card className="group h-full overflow-hidden transition hover:border-navy-900/20">
                  <div className="relative aspect-[4/3] bg-canvas">
                    {u.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(u.images[0].path)} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted/40">
                        {u.listingType === "project" ? <Building2 className="size-8" /> : <ImageOff className="size-8" />}
                      </div>
                    )}
                    <span className="absolute left-2 top-2"><StatusPill name={st.label} colorName={st.color} /></span>
                  </div>
                  <div className="p-3">
                    <p className="truncate font-medium">{u.project ? `${u.project.name} · ${u.unitNo}` : u.unitNo}</p>
                    <p className="truncate text-xs text-muted">
                      {u.type} · {sizeLabel(u.size, u.sizeUnit)}{u.bedrooms ? ` · ${u.bedrooms} bed` : ""}
                      {u.block ? ` · ${u.block.name}` : u.address ? ` · ${u.address}` : ""}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-navy-900">{fmtPKR(u.price)}{u.purpose === "rent" ? <span className="text-xs font-normal text-muted"> /mo</span> : null}</span>
                      {u.owner && <span className="truncate text-xs text-muted">{u.owner.name}</span>}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60">
                <tr>
                  <th className="th">Unit</th>
                  <th className="th">Type</th>
                  <th className="th">Size</th>
                  <th className="th">Price</th>
                  <th className="th">Status</th>
                  <th className="th">Listing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {units.map((u) => {
                  const st = unitStatus(u.status);
                  return (
                    <tr key={u.id} className="hover:bg-canvas/60">
                      <td className="td">
                        <Link href={`/inventory/units/${u.id}`} className="font-medium hover:underline">{u.unitNo}</Link>
                        <p className="text-xs text-muted">{[u.project?.name, u.block?.name].filter(Boolean).join(" · ") || u.address}</p>
                      </td>
                      <td className="td text-muted">{u.type}{u.bedrooms ? ` · ${u.bedrooms} bed` : ""}</td>
                      <td className="td whitespace-nowrap text-muted">{sizeLabel(u.size, u.sizeUnit)}</td>
                      <td className="td whitespace-nowrap">{fmtPKR(u.price)}{u.purpose === "rent" ? " /mo" : ""}</td>
                      <td className="td"><StatusPill name={st.label} colorName={st.color} /></td>
                      <td className="td text-muted">{LISTING_TYPES.find((l) => l.value === u.listingType)?.label}{u.owner ? ` · ${u.owner.name}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination base="/inventory" sp={keep} page={page} pageSize={PAGE_SIZE} total={total} />
      {newDrawer}
    </>
  );
}
