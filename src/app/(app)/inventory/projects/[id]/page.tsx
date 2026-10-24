import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers, Pencil, Plus, Rows3 } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { color, fmtPKR } from "@/lib/crm";
import { FREQUENCIES, UNIT_STATUSES, sizeLabel, unitStatus } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { Badge, Card, Drawer, EmptyState, LinkButton } from "@/components/ui";
import { BlockForm, BulkUnitsForm, ProjectForm, UnitForm } from "../../forms";

export const metadata = { title: "Project" };

type SP = { edit?: string; blocks?: string; bulk?: string; add?: string; status?: string };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("inventory.projects");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const project = await db.project.findUnique({
    where: { id },
    include: {
      blocks: { orderBy: { sortOrder: "asc" }, include: { units: { where: { listingType: "project" }, orderBy: { unitNo: "asc" } } } },
    },
  });
  if (!project) notFound();

  const path = `/inventory/projects/${id}`;
  const canEdit = can(user, "inventory.projects", "edit");
  const canCreate = can(user, "inventory.projects", "create");
  const units = project.blocks.flatMap((b) => b.units);
  const counts = Object.fromEntries(UNIT_STATUSES.map((s) => [s.value, units.filter((u) => u.status === s.value).length]));
  const availableValue = units.filter((u) => u.status === "available").reduce((s, u) => s + (u.price ?? 0), 0);
  const soldValue = units.filter((u) => u.status === "sold" || u.status === "booked").reduce((s, u) => s + (u.price ?? 0), 0);
  const freq = FREQUENCIES.find((f) => f.value === project.planFrequency)?.label.toLowerCase();

  return (
    <>
      <Link href="/inventory?tab=projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Projects
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{project.name}</h1>
            <Badge tone={project.status === "active" ? "green" : "neutral"}>{project.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {[project.location, project.city].filter(Boolean).join(", ")}{project.developer ? ` · ${project.developer}` : ""} · <span className="capitalize">{project.kind}</span>
          </p>
          {project.planDownPct != null && (
            <p className="mt-1 text-sm">
              Plan: <b className="font-medium">{project.planDownPct}% down</b>, {project.planInstallments} {freq} installments
              {project.planPossessionPct ? `, ${project.planPossessionPct}% on possession` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}><Pencil className="size-4" /> Edit</LinkButton>}
          {canEdit && <LinkButton href={`${path}?blocks=1`} variant="secondary" scroll={false}><Layers className="size-4" /> Blocks</LinkButton>}
          {canCreate && project.blocks.length > 0 && <LinkButton href={`${path}?bulk=1`} variant="secondary" scroll={false}><Rows3 className="size-4" /> Bulk add</LinkButton>}
          {canCreate && project.blocks.length > 0 && <LinkButton href={`${path}?add=1`} scroll={false}><Plus className="size-4" /> Add unit</LinkButton>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted">Total units</p><p className="mt-1 text-xl font-semibold">{units.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Available</p><p className="mt-1 text-xl font-semibold text-emerald-700">{counts.available} · {fmtPKR(availableValue)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Booked + sold</p><p className="mt-1 text-xl font-semibold">{(counts.booked ?? 0) + (counts.sold ?? 0)} · {fmtPKR(soldValue)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">On hold</p><p className="mt-1 text-xl font-semibold text-amber-700">{counts.hold}</p></Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Link href={path} className={cn("rounded-full border px-2.5 py-1", !sp.status ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}>All</Link>
        {UNIT_STATUSES.map((s) => (
          <Link key={s.value} href={`${path}?status=${s.value}`} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", sp.status === s.value ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}>
            <span className={cn("size-2 rounded-full", color(s.color).dot)} /> {s.label} {counts[s.value]}
          </Link>
        ))}
      </div>

      {project.blocks.length === 0 ? (
        <Card><EmptyState title="No blocks yet" description="Add a block, tower or phase, then generate its units." action={canEdit && <LinkButton href={`${path}?blocks=1`}>Add block</LinkButton>} /></Card>
      ) : (
        <div className="space-y-4">
          {project.blocks.map((b) => {
            const shown = sp.status ? b.units.filter((u) => u.status === sp.status) : b.units;
            return (
              <Card key={b.id} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-medium">{b.name}</h2>
                  <span className="text-xs text-muted">{b.units.length} units</span>
                </div>
                {shown.length === 0 ? (
                  <p className="text-sm text-muted">No units{sp.status ? " with this status" : ""}.</p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
                    {shown.map((u) => {
                      const st = unitStatus(u.status);
                      return (
                        <Link
                          key={u.id}
                          href={`/inventory/units/${u.id}`}
                          title={`${u.unitNo} · ${u.type} · ${sizeLabel(u.size, u.sizeUnit)} · ${fmtPKR(u.price)} · ${st.label}`}
                          className={cn("rounded-md px-2 py-1.5 text-xs transition hover:ring-2 hover:ring-navy-900/30", color(st.color).pill)}
                        >
                          <span className="block font-semibold">{u.unitNo}</span>
                          <span className="block truncate opacity-80">{fmtPKR(u.price, { prefix: false })}</span>
                          {(u.corner || u.parkFacing) && <span className="block truncate text-[10px] opacity-70">{[u.corner && "Corner", u.parkFacing && "Park"].filter(Boolean).join(" · ")}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {sp.edit && canEdit && (
        <Drawer title="Edit project" closeHref={path}>
          <ProjectForm project={project} cancelHref={path} />
        </Drawer>
      )}
      {sp.blocks && canEdit && (
        <Drawer title="Blocks, towers & phases" closeHref={path}>
          <div className="space-y-4">
            {project.blocks.map((b) => (
              <BlockForm key={b.id} projectId={id} block={b} />
            ))}
            <div className="border-t border-line pt-4">
              <BlockForm projectId={id} />
            </div>
          </div>
        </Drawer>
      )}
      {sp.bulk && canCreate && (
        <Drawer title="Bulk add units" closeHref={path}>
          <BulkUnitsForm projectId={id} blocks={project.blocks} />
        </Drawer>
      )}
      {sp.add && canCreate && (
        <Drawer title="Add unit" closeHref={path}>
          <UnitForm projects={[project]} owners={[]} currentUserId={user.id} cancelHref={path} allowedTypes={["project"]} defaults={{ blockId: project.blocks[0]?.id }} />
        </Drawer>
      )}
    </>
  );
}
