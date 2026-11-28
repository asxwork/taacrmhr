import { dealTypes } from "@/lib/deal-types";
import { unitTypeOf } from "@/lib/deal-types-shared";
import Link from "@/components/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { subDays } from "date-fns";
import { Building2, Flame, ImageOff, LayoutGrid, List, MapPin, Plus, Search, SlidersHorizontal } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { color, fmtPKR, parseAmount } from "@/lib/crm";
import { LISTING_TYPES, UNIT_STATUSES, UNIT_TYPES, areaNames, areaOf, areaWhere, developerNames, guessArea, sizeLabel, syncInventoryCatalog, unitStatus, unitWhere } from "@/lib/inventory";
import { AreaForm, DeveloperForm } from "./catalog-forms";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { Badge, Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Pagination, StatusPill, hrefWith } from "@/components/crm/bits";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { SafeImg } from "@/components/safe-img";

// Units with no Type of their own get one from their listing type.
const KIND_FROM_LISTING: Record<string, string> = { "Off-plan": "project", Sale: "resale", Rental: "rental" };

export const metadata = { title: "Inventory" };

const PAGE_SIZE = 48;
type SP = {
  kind?: string;
  tab?: string; q?: string; project?: string; type?: string; status?: string; listing?: string; purpose?: string;
  min?: string; max?: string; view?: string; page?: string; new?: string;
  developer?: string; area?: string; beds?: string; feat?: string; sort?: string; add?: string;
};
const TABS = [["units", "Units"], ["projects", "Projects"], ["developers", "Developers"], ["areas", "Areas"]] as const;
const SORTS = [["", "Project & unit"], ["price", "Price: low to high"], ["-price", "Price: high to low"], ["new", "Newest first"], ["size", "Size: large first"]] as const;
const FEATURES = [["corner", "Corner"], ["park", "Park facing"], ["road", "Main road"]] as const;
const short = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(n >= 1e9 ? 0 : 1)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} Lac` : n.toLocaleString("en-PK"));
const range = (a: number | null | undefined, b: number | null | undefined) => (a && b ? (a === b ? short(a) : `${short(a)} – ${short(b)}`) : "—");

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (sp.new) redirect(hrefWith("/inventory/new", { tab: sp.tab }, {})); // old links
  const canProjects = can(user, "inventory.projects");
  // Who may see which units, and the project / developer / area lists, in one round.
  const [visible, projects, developers, areas, kinds] = await Promise.all([
    unitWhere(user, "view"),
    db.project.findMany({ include: { blocks: { orderBy: { sortOrder: "asc" } }, images: { orderBy: { sortOrder: "asc" }, take: 1 } }, orderBy: { name: "asc" } }),
    developerNames(), areaNames(), dealTypes(),
  ]);
  if (!visible && !canProjects) redirect("/no-access");
  const tab = (TABS.some(([t]) => t === sp.tab) ? sp.tab : "units") as (typeof TABS)[number][0];
  if (tab === "projects" && !canProjects) redirect("/inventory");
  const view = sp.view === "table" ? "table" : "grid";
  const page = Math.max(1, Number(sp.page) || 1);
  const keep = { tab: sp.tab, q: sp.q, project: sp.project, type: sp.type, status: sp.status, listing: sp.listing, kind: sp.kind, purpose: sp.purpose, min: sp.min, max: sp.max, view: sp.view, developer: sp.developer, area: sp.area, beds: sp.beds, feat: sp.feat, sort: sp.sort };
  const allowedTypes = [
    ...(can(user, "inventory.projects", "create") ? ["project"] : []),
    ...(can(user, "inventory.units", "create") ? ["resale", "rental"] : []),
  ];

  const canCatalog = user.isSuperAdmin || can(user, "inventory.projects", "edit") || can(user, "inventory.projects", "create");
  if (tab === "developers" || tab === "areas") await syncInventoryCatalog();
  const [devRecs, areaRecs] = tab === "developers" || tab === "areas" ? await Promise.all([db.developer.findMany(), db.inventoryArea.findMany()]) : [[], []];
  const addDrawer = sp.add && canCatalog && (tab === "developers" || tab === "areas") ? (
    <Drawer title={tab === "developers" ? "Add developer" : "Add area"} closeHref={`/inventory?tab=${tab}`}>{tab === "developers" ? <DeveloperForm /> : <AreaForm />}</Drawer>
  ) : null;
  const header = (
    <>
      {addDrawer}
      <PageHeader
        title="Inventory"
        actions={
          <>
            {tab === "units" && (
              <div className="flex max-w-full overflow-x-auto rounded-lg bg-black/5 p-0.5">
                {([["grid", LayoutGrid, "Cards"], ["table", List, "Table"]] as const).map(([v, Icon, label]) => (
                  <Link key={v} href={hrefWith("/inventory", keep, { view: v === "grid" ? undefined : v, page: undefined })} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", view === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
                    <Icon className="size-4" /> {label}
                  </Link>
                ))}
              </div>
            )}
            {(tab === "developers" || tab === "areas") && canCatalog && (
              <Link href={`/inventory?tab=${tab}&add=1`} scroll={false} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-canvas"><Plus className="size-4" /> {tab === "developers" ? "Add developer" : "Add area"}</Link>
            )}
            {(tab === "projects" || tab === "developers" ? can(user, "inventory.projects", "create") : allowedTypes.length > 0) && (
              <LinkButton href={hrefWith("/inventory/new", { tab: tab === "developers" ? "projects" : sp.tab }, {})} prefetch>
                <Plus className="size-4" /> {tab === "projects" || tab === "developers" ? "New project" : "Add unit"}
              </LinkButton>
            )}
          </>
        }
      />
    </>
  );

  // ---------- Projects ----------
  if (tab === "projects") {
    const shown = projects.filter((p) => (!sp.developer || p.developer === sp.developer) && (!sp.area || p.location === sp.area) && (!sp.status || p.status === sp.status));
    const counts = await db.unit.groupBy({ by: ["projectId", "status"], where: { listingType: "project" }, _count: true });
    return (
      <>
        {header}
        <AutoFilterForm className="mb-4 flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="projects" />
          <select name="developer" defaultValue={sp.developer ?? ""} className="input w-44" aria-label="Developer"><option value="">All developers</option>{developers.map((d) => <option key={d}>{d}</option>)}</select>
          <select name="area" defaultValue={sp.area ?? ""} className="input w-44" aria-label="Area"><option value="">All areas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? ""} className="input w-36" aria-label="Status"><option value="">Any status</option><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="completed">Completed</option></select>
        </AutoFilterForm>
        {shown.length === 0 ? (
          <Card><EmptyState title={projects.length ? "No projects match" : "No projects yet"} description={projects.length ? "Try clearing filters." : "Create a project, add blocks, then generate its units."} /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {shown.map((p) => {
              const rows = counts.filter((c) => c.projectId === p.id);
              const total = rows.reduce((s, r) => s + r._count, 0);
              return (
                <Link key={p.id} href={`/inventory/projects/${p.id}`}>
                  <Card className="h-full overflow-hidden transition hover:border-navy-900/20">
                    {p.images[0] && <SafeImg src={fileUrl(p.images[0].path, 800)} alt="" className="aspect-[16/7] w-full object-cover" loading="lazy" />}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-sm text-muted">{[p.location, p.city].filter(Boolean).join(", ")}{p.developer ? ` · ${p.developer}` : ""}</p>
                        </div>
                        <Badge tone={p.status === "active" ? "green" : "neutral"}>{p.status}</Badge>
                      </div>
                      <StatusBar rows={rows.map((r) => ({ status: r.status, n: r._count }))} total={total} />
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span><b className="font-medium text-ink">{total}</b> units · {p.blocks.length} blocks</span>
                        {UNIT_STATUSES.map((s) => { const n = rows.find((r) => r.status === s.value)?._count; return n ? <span key={s.value}>{s.label} {n}</span> : null; })}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ---------- Developers ----------
  if (tab === "developers") {
    const since = subDays(new Date(), 90);
    const [byStatus, avail, demand] = await Promise.all([
      db.unit.groupBy({ by: ["projectId", "status"], where: { AND: [visible ?? { id: "" }, { projectId: { not: null } }] }, _count: true }),
      db.unit.groupBy({ by: ["projectId"], where: { AND: [visible ?? { id: "" }, { projectId: { not: null }, status: "available" }] }, _sum: { price: true }, _min: { price: true }, _max: { price: true } }),
      db.lead.groupBy({ by: ["projectId"], where: { projectId: { not: null }, createdAt: { gte: since } }, _count: true }),
    ]);
    const groups = [...new Set([...devRecs.map((d) => d.name), ...projects.map((p) => p.developer ?? "")])].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1)).map((dev) => {
      const ps = projects.filter((p) => (p.developer ?? "") === dev);
      const ids = new Set(ps.map((p) => p.id));
      const st = byStatus.filter((r) => r.projectId && ids.has(r.projectId));
      const av = avail.filter((r) => r.projectId && ids.has(r.projectId));
      const total = st.reduce((s, r) => s + r._count, 0);
      const statusRows = UNIT_STATUSES.map((s) => ({ status: s.value, n: st.filter((r) => r.status === s.value).reduce((a, r) => a + r._count, 0) })).filter((r) => r.n);
      const available = statusRows.find((r) => r.status === "available")?.n ?? 0;
      const moved = statusRows.filter((r) => ["booked", "sold"].includes(r.status)).reduce((a, r) => a + r.n, 0);
      const mins = av.map((r) => r._min.price).filter((x): x is number => !!x), maxs = av.map((r) => r._max.price).filter((x): x is number => !!x);
      const leads = demand.filter((r) => r.projectId && ids.has(r.projectId)).reduce((a, r) => a + r._count, 0);
      return { dev, ps, total, statusRows, available, moved, value: av.reduce((a, r) => a + (r._sum.price ?? 0), 0), min: mins.length ? Math.min(...mins) : null, max: maxs.length ? Math.max(...maxs) : null, leads };
    });
    return (
      <>
        {header}
        {groups.length === 0 ? <Card><EmptyState title="No projects yet" description="Add projects with their developer to see stock per developer." /></Card> : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {groups.map((g) => (
              <Card key={g.dev || "none"} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{(() => { const rec = devRecs.find((d) => d.name === g.dev); return rec ? <Link href={`/inventory/developers/${rec.id}`} className="hover:underline">{g.dev}</Link> : g.dev || "No developer set"; })()}</p>
                    <p className="text-sm text-muted">{g.ps.length} project{g.ps.length === 1 ? "" : "s"} · {g.total} units · {g.total ? Math.round((g.moved / g.total) * 100) : 0}% booked or sold</p>
                  </div>
                  {g.dev && <Link href={hrefWith("/inventory", {}, { developer: g.dev, status: "available" })} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas">Available units</Link>}
                </div>
                <StatusBar rows={g.statusRows} total={g.total} />
                <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([["Available", g.available], ["Stock value", g.value ? short(g.value) : "—"], ["Price range", range(g.min, g.max)], ["Leads 90d", g.leads]] as const).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-canvas px-3 py-2"><dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt><dd className="text-sm font-semibold tabular-nums">{v}</dd></div>
                  ))}
                </dl>
                <ul className="mt-4 divide-y divide-line text-sm">
                  {g.ps.map((p) => {
                    const n = byStatus.filter((r) => r.projectId === p.id).reduce((a, r) => a + r._count, 0);
                    const a = byStatus.find((r) => r.projectId === p.id && r.status === "available")?._count ?? 0;
                    const l = demand.find((r) => r.projectId === p.id)?._count ?? 0;
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                        <Link href={`/inventory/projects/${p.id}`} className="min-w-0 truncate font-medium hover:underline">{p.name}<span className="ml-2 text-xs font-normal text-muted">{p.location ?? ""}</span></Link>
                        <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
                          <span><b className="text-ink">{a}</b>/{n} free</span>
                          {l > 0 && <Link href={`/crm/leads?project=${p.id}`} className="hover:underline">{l} leads</Link>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </>
    );
  }

  // ---------- Areas ----------
  if (tab === "areas") {
    const since = subDays(new Date(), 90);
    const [all, leads] = await Promise.all([
      db.unit.findMany({ where: visible ?? { id: "" }, select: { status: true, price: true, type: true, area: true, address: true, purpose: true, project: { select: { id: true, name: true, location: true } } } }),
      db.lead.findMany({ where: { createdAt: { gte: since }, OR: [{ location: { not: null } }, { projectId: { not: null } }] }, select: { location: true, project: { select: { location: true } } } }),
    ]);
    const map = new Map<string, typeof all>(areaRecs.map((a) => [a.name, []]));
    for (const u of all) { const a = areaOf(u) ?? guessArea(u.address, areas) ?? "Other / not set"; map.set(a, [...(map.get(a) ?? []), u]); }
    const leadArea = leads.map((l) => (l.project?.location ?? l.location ?? "").toLowerCase()).filter(Boolean);
    const rows = [...map.entries()].map(([area, us]) => {
      const free = us.filter((u) => u.status === "available");
      const prices = free.map((u) => u.price).filter((x): x is number => !!x);
      const types = [...new Set(free.map((u) => u.type))];
      const projs = [...new Map(us.filter((u) => u.project).map((u) => [u.project!.id, u.project!.name])).entries()];
      const want = area === "Other / not set" ? 0 : leadArea.filter((l) => l.includes(area.toLowerCase())).length;
      return { area, total: us.length, free: free.length, rent: free.filter((u) => u.purpose === "rent").length, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, types, projs, want };
    }).sort((a, b) => (a.area === "Other / not set" ? 1 : b.area === "Other / not set" ? -1 : b.free - a.free || b.want - a.want));
    return (
      <>
        {header}
        <p className="mb-4 text-sm text-muted">Stock per area, with how many leads asked for that area in the last 90 days. <Flame className="inline size-3.5 text-orange-500" /> = more demand than free stock.</p>
        {rows.length === 0 ? <Card><EmptyState title="No units yet" /></Card> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const hot = r.want > 0 && r.want > r.free;
              return (
                <Card key={r.area} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 font-semibold"><MapPin className="size-4 shrink-0 text-muted" />{(() => { const rec = areaRecs.find((a) => a.name === r.area); return rec ? <Link href={`/inventory/areas/${rec.id}`} className="truncate hover:underline">{r.area}</Link> : <span className="truncate">{r.area}</span>; })()}</p>
                    {hot && <Badge tone="amber"><Flame className="mr-1 inline size-3" />Hot</Badge>}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {([["Free", r.free], ["All units", r.total], ["Leads 90d", r.want]] as const).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-canvas py-1.5"><dt className="text-[10px] uppercase tracking-wide text-muted">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-muted">Price: <b className="text-ink">{range(r.min, r.max)}</b>{r.rent ? ` · ${r.rent} for rent` : ""}</p>
                  {r.types.length > 0 && <p className="mt-1 text-xs text-muted">{r.types.join(" · ")}</p>}
                  {r.projs.length > 0 && <p className="mt-1 truncate text-xs text-muted">Projects: {r.projs.map(([, n]) => n).join(", ")}</p>}
                  {r.area !== "Other / not set" && (
                    <div className="mt-auto flex gap-2 pt-3">
                      <Link href={hrefWith("/inventory", {}, { area: r.area, status: "available" })} className="flex-1 rounded-lg border border-line px-3 py-1.5 text-center text-sm hover:bg-canvas">Free units</Link>
                      <Link href={hrefWith("/inventory", {}, { area: r.area })} className="flex-1 rounded-lg px-3 py-1.5 text-center text-sm text-muted hover:bg-canvas">All units</Link>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ---------- Units ----------
  const q = sp.q?.trim();
  const min = sp.min ? parseAmount(sp.min) : null;
  const max = sp.max ? parseAmount(sp.max) : null;
  const feats = (sp.feat ?? "").split(",").filter(Boolean);
  const beds = Number(sp.beds) || 0;
  const listingClause: Prisma.UnitWhereInput[] = sp.listing ? [{ listingType: sp.listing }] : [];
  const base: Prisma.UnitWhereInput[] = [
    visible ?? { id: "" },
    ...(q ? [{ OR: [{ unitNo: { contains: q } }, { address: { contains: q } }, { area: { contains: q } }, { project: { name: { contains: q } } }, { project: { developer: { contains: q } } }, { propertyOwner: { contains: q } }] }] : []),
    ...(sp.project ? [{ projectId: sp.project }] : []),
    ...(sp.developer ? [{ project: { developer: sp.developer } }] : []),
    ...(sp.area ? [areaWhere(sp.area)] : []),
    ...(sp.type ? [{ type: sp.type }] : []),
    ...listingClause,
    // Type (Off-plan, Sale, Rental…): set on the unit, or from its listing type when not set.
    ...(sp.kind ? [{ OR: [{ dealType: sp.kind }, ...(KIND_FROM_LISTING[sp.kind] ? [{ dealType: null, listingType: KIND_FROM_LISTING[sp.kind] }] : [])] }] : []),
    ...(sp.purpose ? [{ purpose: sp.purpose }] : []),
    ...(beds ? [{ bedrooms: beds >= 5 ? { gte: 5 } : beds }] : []),
    ...(feats.includes("corner") ? [{ corner: true }] : []),
    ...(feats.includes("park") ? [{ parkFacing: true }] : []),
    ...(feats.includes("road") ? [{ mainRoad: true }] : []),
    ...(min != null || max != null ? [{ price: { ...(min != null && { gte: min }), ...(max != null && { lte: max }) } }] : []),
  ];
  const where: Prisma.UnitWhereInput = { AND: [...base, ...(sp.status ? [{ status: sp.status }] : [])] };
  const orderBy: Prisma.UnitOrderByWithRelationInput[] =
    sp.sort === "price" ? [{ price: "asc" }] : sp.sort === "-price" ? [{ price: "desc" }] : sp.sort === "new" ? [{ createdAt: "desc" }] : sp.sort === "size" ? [{ size: "desc" }] : [{ project: { name: "asc" } }, { unitNo: "asc" }];
  const [units, total, statusCounts, freeValue] = await Promise.all([
    db.unit.findMany({
      where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: { project: { select: { name: true, developer: true, location: true } }, block: true, owner: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
    db.unit.count({ where }),
    db.unit.groupBy({ by: ["status"], where: { AND: base }, _count: true }),
    db.unit.aggregate({ where: { AND: [...base, { status: "available" }] }, _sum: { price: true } }),
  ]);
  const extraOn = [sp.listing, sp.kind, sp.purpose, sp.beds, sp.feat, sp.min, sp.max, sp.sort].filter(Boolean).length;
  const allCount = statusCounts.reduce((s, r) => s + r._count, 0);
  // Sale / Rental / Off-plan tabs, with how many units each has (within the other filters).
  const typeCounts = await db.unit.groupBy({ by: ["listingType"], where: { AND: [...base.filter((w) => !listingClause.includes(w)), ...(sp.status ? [{ status: sp.status }] : [])] }, _count: true }).catch(() => []);
  const typeN = (v: string) => typeCounts.find((r) => r.listingType === v)?._count ?? 0;

  return (
    <>
      {header}
      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Sale, Rental or Off-plan">
        {[{ value: "", label: "All" }, ...LISTING_TYPES].map((l) => {
          const on = (sp.listing ?? "") === l.value;
          const n = l.value ? typeN(l.value) : typeCounts.reduce((a, r) => a + r._count, 0);
          return <Link key={l.value || "all"} href={hrefWith("/inventory", keep, { listing: l.value || undefined, page: undefined })} role="tab" aria-selected={on} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>{l.label}<span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-white/20" : "bg-canvas"}`}>{n}</span></Link>;
        })}
      </div>
      <AutoFilterForm className="mb-3 space-y-2">
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted" />
            <input name="q" defaultValue={q} aria-label="Search" placeholder="Unit, project, developer, area, owner" className="input pl-9" />
          </div>
          {/* Phones: developer / area / project / type fold away behind a Filters button. */}
          <input type="checkbox" id="inv-filters" className="peer sr-only" defaultChecked={!!(sp.developer || sp.area || sp.project || sp.type)} />
          <label htmlFor="inv-filters" className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-muted sm:hidden"><SlidersHorizontal className="size-4" /> Filters{[sp.developer, sp.area, sp.project, sp.type].filter(Boolean).length ? ` (${[sp.developer, sp.area, sp.project, sp.type].filter(Boolean).length})` : ""}</label>
          <div className="flex w-full flex-wrap gap-2 max-sm:hidden max-sm:peer-checked:flex sm:contents">
          <select name="developer" defaultValue={sp.developer ?? ""} className="input w-[calc(50%-0.25rem)] sm:w-40" aria-label="Developer"><option value="">All developers</option>{developers.map((d) => <option key={d}>{d}</option>)}</select>
          <select name="area" defaultValue={sp.area ?? ""} className="input w-[calc(50%-0.25rem)] sm:w-40" aria-label="Area"><option value="">All areas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
          <select name="project" defaultValue={sp.project ?? ""} className="input w-[calc(50%-0.25rem)] sm:w-40" aria-label="Project">
            <option value="">All projects</option>
            {projects.filter((p) => !sp.developer || p.developer === sp.developer).filter((p) => !sp.area || p.location === sp.area).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="type" defaultValue={sp.type ?? ""} className="input w-[calc(50%-0.25rem)] sm:w-32" aria-label="Type"><option value="">Any type</option>{UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
        </div>
        <details className="group rounded-lg" open={extraOn > 0}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted hover:bg-canvas hover:text-ink">
            <SlidersHorizontal className="size-4" /> More filters{extraOn ? ` (${extraOn})` : ""}
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select name="kind" defaultValue={sp.kind ?? ""} className="input w-36" aria-label="Type"><option value="">All types</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select>
            {sp.listing && <input type="hidden" name="listing" value={sp.listing} />}
            <select name="purpose" defaultValue={sp.purpose ?? ""} className="input w-28" aria-label="Sale or rent"><option value="">Sale & rent</option><option value="sale">For sale</option><option value="rent">For rent</option></select>
            <select name="beds" defaultValue={sp.beds ?? ""} className="input w-28" aria-label="Bedrooms"><option value="">Any beds</option>{[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b} bed</option>)}<option value="5">5+ bed</option></select>
            <input name="min" defaultValue={sp.min} placeholder="Min price" aria-label="Min price" className="input w-28" />
            <input name="max" defaultValue={sp.max} placeholder="Max price" aria-label="Max price" className="input w-28" />
            <select name="feat" defaultValue={sp.feat ?? ""} className="input w-36" aria-label="Feature"><option value="">Any feature</option>{FEATURES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select name="sort" defaultValue={sp.sort ?? ""} className="input w-44" aria-label="Sort">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {Object.values(keep).some((v, i) => v && !["tab", "view"].includes(Object.keys(keep)[i]!)) && <Link href={hrefWith("/inventory", { view: sp.view }, {})} className="px-2 text-sm text-muted hover:text-ink hover:underline">Clear all</Link>}
          </div>
        </details>
      </AutoFilterForm>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={hrefWith("/inventory", keep, { status: undefined, page: undefined })} className={cn("rounded-full border px-3 py-1 text-sm", !sp.status ? "border-navy-900 bg-navy-900 text-white" : "border-line hover:bg-canvas")}>All <span className="tabular-nums opacity-70">{allCount}</span></Link>
        {UNIT_STATUSES.map((s) => {
          const n = statusCounts.find((r) => r.status === s.value)?._count ?? 0;
          if (!n && sp.status !== s.value) return null;
          return (
            <Link key={s.value} href={hrefWith("/inventory", keep, { status: sp.status === s.value ? undefined : s.value, page: undefined })}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", sp.status === s.value ? "border-navy-900 bg-navy-900 text-white" : "border-line hover:bg-canvas")}>
              <span className={cn("size-2 rounded-full", color(s.color).bar)} />{s.label} <span className="tabular-nums opacity-70">{n}</span>
            </Link>
          );
        })}
        {(freeValue._sum.price ?? 0) > 0 && <span className="ml-auto text-sm text-muted">Available stock: <b className="text-ink">PKR {short(freeValue._sum.price!)}</b></span>}
      </div>

      {units.length === 0 ? (
        <Card><EmptyState title="No units match" description="Try clearing filters." /></Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {units.map((u) => {
            const st = unitStatus(u.status);
            const area = areaOf(u);
            const tags = [u.corner && "Corner", u.parkFacing && "Park", u.mainRoad && "Main road"].filter(Boolean) as string[];
            return (
              <Link key={u.id} href={`/inventory/units/${u.id}`}>
                <Card className="group h-full overflow-hidden transition hover:border-navy-900/20">
                  <div className="relative aspect-[4/3] bg-canvas">
                    {u.images[0] ? (
                      <SafeImg src={fileUrl(u.images[0].path, 400)} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted/40">
                        {u.listingType === "project" ? <Building2 className="size-8" /> : <ImageOff className="size-8" />}
                      </div>
                    )}
                    <span className="absolute left-2 top-2"><StatusPill name={st.label} colorName={st.color} /></span>
                    {tags.length > 0 && <span className="absolute bottom-2 left-2 flex gap-1">{tags.map((t) => <span key={t} className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-navy-900 shadow-sm">{t}</span>)}</span>}
                  </div>
                  <div className="p-3">
                    <p className="truncate font-medium">{u.project ? `${u.project.name} · ${u.unitNo}` : u.unitNo}</p>
                    <p className="truncate text-xs text-muted">
                      {unitTypeOf(u)} · {u.type} · {sizeLabel(u.size, u.sizeUnit)}{u.bedrooms ? ` · ${u.bedrooms} bed` : ""}{u.block ? ` · ${u.block.name}` : ""}
                    </p>
                    {(area || u.project?.developer) && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted"><MapPin className="size-3 shrink-0" />{[area, u.project?.developer].filter(Boolean).join(" · ")}</p>}
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
                  <th className="th">Area · developer</th>
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
                      <td className="td text-sm text-muted">{[areaOf(u), u.project?.developer].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="td text-muted">{u.type}{u.bedrooms ? ` · ${u.bedrooms} bed` : ""}</td>
                      <td className="td whitespace-nowrap text-muted">{sizeLabel(u.size, u.sizeUnit)}</td>
                      <td className="td whitespace-nowrap">{fmtPKR(u.price)}{u.purpose === "rent" ? " /mo" : ""}</td>
                      <td className="td"><StatusPill name={st.label} colorName={st.color} /></td>
                      <td className="td text-muted">{unitTypeOf(u)}{u.owner ? ` · ${u.owner.name}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination base="/inventory" sp={keep} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}

function StatusBar({ rows, total }: { rows: { status: string; n: number }[]; total: number }) {
  return (
    <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-canvas">
      {total > 0 && UNIT_STATUSES.map((s) => {
        const n = rows.find((r) => r.status === s.value)?.n ?? 0;
        return n ? <span key={s.value} className={color(s.color).bar} style={{ width: `${(n / total) * 100}%` }} title={`${s.label}: ${n}`} /> : null;
      })}
    </div>
  );
}
