import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { assignableUsers } from "@/lib/crm";
import { fieldAccess } from "@/lib/field-rules";
import { unitLabel, unitWhere } from "@/lib/inventory";
import { FormPage } from "@/components/ui";
import { DealForm } from "../deal-form";

export const metadata = { title: "New deal" };

/** Loads only what the form needs, so it opens without rebuilding the deals board. */
export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ pipeline?: string; contact?: string; unit?: string }> }) {
  const user = await requirePermission("crm.deals");
  if (!can(user, "crm.deals", "create")) redirect("/crm/deals");
  const sp = await searchParams;
  const [pipelines, contacts, sources, owners, unit, fields] = await Promise.all([
    db.pipeline.findMany({ select: { id: true, name: true, isDefault: true }, orderBy: { sortOrder: "asc" } }),
    scopeWhere(user, "crm.contacts").then((w) => db.contact.findMany({ where: w ?? { id: "" }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 500 })),
    db.leadSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    assignableUsers(user, "crm.deals"),
    // "Create deal" on a unit page: that unit, if this user can see it and it's free.
    sp.unit ? unitWhere(user, "view").then((w) => w && db.unit.findFirst({ where: { id: sp.unit, activeDealId: null, status: { in: ["available", "hold"] }, ...w }, include: { project: true, block: true } })) : null,
    fieldAccess(user),
  ]);
  const back = sp.pipeline ? `/crm/deals?pipeline=${sp.pipeline}` : "/crm/deals";
  return (
    <FormPage title="New deal" backHref={back} backLabel="Deals">
      <DealForm
        hideValue={fields["deal.value"] === "hidden"}
        pipelines={pipelines} contacts={contacts} sources={sources} owners={owners} currentUserId={user.id} cancelHref={back}
        defaultPipelineId={sp.pipeline ?? pipelines.find((p) => p.isDefault)?.id} defaultContactId={sp.contact}
        unit={unit ? { id: unit.id, label: unitLabel(unit), price: unit.price, purpose: unit.purpose } : null}
      />
    </FormPage>
  );
}
