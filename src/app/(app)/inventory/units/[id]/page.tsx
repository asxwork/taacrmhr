import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Handshake, MapPin, Pencil, Phone, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeWhere } from "@/lib/permissions";
import { assignableUsers, fmtPKR } from "@/lib/crm";
import { LISTING_TYPES, sizeLabel, unitAllows, unitStatus, unitWhere } from "@/lib/inventory";
import { fmtDate } from "@/lib/utils";
import { Button, Card, Drawer, LinkButton } from "@/components/ui";
import { InfoList, StatusPill } from "@/components/crm/bits";
import { UnitForm } from "../../forms";
import { deleteUnit, deleteUnitImage, setUnitCover, setUnitStatus, uploadUnitImages } from "../../actions";
import { PhotoManager } from "@/components/photo-manager";

export const metadata = { title: "Unit" };

export default async function UnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; photo?: string }> }) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const visible = await unitWhere(user, "view");
  const unit = visible
    ? await db.unit.findFirst({
        where: { id, ...visible },
        include: { project: true, block: true, owner: true, branch: true, images: { orderBy: { sortOrder: "asc" } }, deals: { include: { deal: { include: { stage: true, owner: true } } } } },
      })
    : null;
  if (!unit) notFound();

  const path = `/inventory/units/${id}`;
  const [canEdit, canDelete] = await Promise.all([unitAllows(user, unit, "edit"), unitAllows(user, unit, "delete")]);
  const st = unitStatus(unit.status);
  const dealScope = await scopeWhere(user, "crm.deals");
  const visibleDealIds = dealScope
    ? new Set((await db.deal.findMany({ where: { id: { in: unit.deals.map((d) => d.dealId) }, ...dealScope }, select: { id: true } })).map((d) => d.id))
    : new Set<string>();
  // Leads that came in about this exact unit (only the ones this user may see).
  const leadScope = await scopeWhere(user, "crm.leads");
  const enquiries = leadScope
    ? await db.lead.findMany({ where: { unitId: unit.id, ...leadScope }, include: { status: true, owner: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 })
    : [];
  const title = unit.project ? `${unit.project.name} · ${unit.unitNo}` : unit.unitNo;
  const canCreateDeal = can(user, "crm.deals", "create") && !unit.activeDealId && ["available", "hold"].includes(unit.status);
  const rentalPipelineId = unit.purpose === "rent" ? (await db.pipeline.findFirst({ where: { name: { contains: "Rent" } }, select: { id: true } }))?.id : undefined;

  const editData = sp.edit && canEdit
    ? await Promise.all([
        db.project.findMany({ include: { blocks: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } }),
        assignableUsers(user, "inventory.units"),
      ])
    : null;

  return (
    <>
      <Link href={unit.projectId ? `/inventory/projects/${unit.projectId}` : "/inventory"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {unit.project?.name ?? "Inventory"}
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
            <StatusPill name={st.label} colorName={st.color} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {unit.type} · {sizeLabel(unit.size, unit.sizeUnit)}{unit.bedrooms ? ` · ${unit.bedrooms} bed` : ""}{unit.bathrooms ? ` · ${unit.bathrooms} bath` : ""}
            {unit.block ? ` · ${unit.block.name}` : ""}
          </p>
          <p className="mt-1 text-2xl font-semibold text-navy-900">{fmtPKR(unit.price)}{unit.purpose === "rent" && <span className="text-sm font-normal text-muted"> / month</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateDeal && <LinkButton href={`/crm/deals?new=1&unit=${unit.id}${unit.purpose === "rent" ? "&pipeline=" + (rentalPipelineId ?? "") : ""}`} prefetch><Handshake className="size-4" /> Create deal</LinkButton>}
          {canEdit && <LinkButton href={`${path}?edit=1`} variant="secondary" scroll={false}><Pencil className="size-4" /> Edit</LinkButton>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <PhotoManager
            photos={unit.images}
            title={title}
            path={path}
            selectedId={sp.photo}
            canEdit={canEdit}
            owner={{ name: "unitId", value: id }}
            upload={uploadUnitImages}
            setCover={setUnitCover}
            remove={deleteUnitImage}
          />

          {unit.notes && <Card className="whitespace-pre-line p-5 text-sm">{unit.notes}</Card>}
        </div>

        <div className="space-y-4">
          {canEdit && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-medium">Status</h2>
              {unit.activeDealId ? (
                <p className="text-sm text-muted">Managed by its deal. Change the deal stage to update it.</p>
              ) : (
                <form action={setUnitStatus} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={id} />
                  {(["available", "hold", "offmarket"] as const).map((s) => (
                    <button key={s} name="status" value={s} disabled={unit.status === s} className="rounded-md border border-line px-3 py-1.5 text-sm enabled:hover:bg-canvas disabled:bg-navy-900 disabled:text-white">
                      {unitStatus(s).label}
                    </button>
                  ))}
                </form>
              )}
            </Card>
          )}
          <Card className="p-5">
            <InfoList
              rows={[
                ["Listing", LISTING_TYPES.find((l) => l.value === unit.listingType)?.label],
                ["Purpose", unit.purpose === "rent" ? "For rent" : "For sale"],
                ["Floor", unit.floor],
                ["Facing", unit.facing],
                ["Features", [unit.corner && "Corner", unit.parkFacing && "Park facing", unit.mainRoad && "Main road"].filter(Boolean).join(", ")],
                ["Price / unit", unit.price && unit.size ? `${fmtPKR(unit.price / unit.size)} per ${unit.sizeUnit}` : null],
                ["Listing agent", unit.owner?.name],
                ["Branch", unit.branch?.name],
                ["Added", fmtDate(unit.createdAt)],
              ]}
            />
          </Card>
          {enquiries.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-medium">Leads for this property <span className="text-muted">{enquiries.length}</span></h2>
              <ul className="divide-y divide-line">
                {enquiries.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
                    <Link href={`/crm/leads/${l.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{l.name}</Link>
                    <StatusPill name={l.status.name} colorName={l.status.color} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(unit.address || unit.lat) && (
            <Card className="p-5 text-sm">
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" /> {unit.address ?? `${unit.lat}, ${unit.lng}`}</p>
              {unit.lat && unit.lng && (
                <a href={`https://www.google.com/maps?q=${unit.lat},${unit.lng}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-navy-900 underline">Open in Google Maps</a>
              )}
            </Card>
          )}
          {unit.propertyOwner && (
            <Card className="p-5 text-sm">
              <p className="text-xs text-muted">Property owner</p>
              <p className="font-medium">{unit.propertyOwner}</p>
              {unit.propertyOwnerPhone && (
                <a href={`tel:${unit.propertyOwnerPhone}`} className="mt-1 inline-flex items-center gap-1.5 text-muted hover:text-ink"><Phone className="size-3.5" /> {unit.propertyOwnerPhone}</a>
              )}
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-medium">Deals ({unit.deals.length})</h2>
            {unit.deals.length === 0 ? (
              <p className="text-sm text-muted">Not linked to any deal.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {unit.deals.map(({ deal }) => (
                  <li key={deal.id} className="flex items-center justify-between gap-2">
                    {visibleDealIds.has(deal.id) ? <Link href={`/crm/deals/${deal.id}`} className="truncate font-medium hover:underline">{deal.title}</Link> : <span className="truncate text-muted">{deal.owner?.name ?? "Another agent"}’s deal</span>}
                    <StatusPill name={deal.stage.name} colorName={deal.stage.color} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canDelete && unit.deals.length === 0 && (
            <form action={deleteUnit}>
              <input type="hidden" name="id" value={id} />
              <Button variant="ghost" className="text-muted hover:text-red-600"><Trash2 className="size-4" /> Delete unit</Button>
            </form>
          )}
        </div>
      </div>

      {editData && (
        <Drawer title="Edit unit" closeHref={path}>
          <UnitForm unit={unit} projects={editData[0]} owners={editData[1]} currentUserId={user.id} cancelHref={path} allowedTypes={[]} />
        </Drawer>
      )}
    </>
  );
}
