import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { assignableUsers } from "@/lib/crm";
import { FormPage } from "@/components/ui";
import { ProjectForm, UnitForm } from "../forms";

export const metadata = { title: "Add to inventory" };

export default async function NewInventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if ((await searchParams).tab === "projects") {
    if (!can(user, "inventory.projects", "create")) redirect("/inventory?tab=projects");
    return (
      <FormPage title="New project" backHref="/inventory?tab=projects" backLabel="Projects">
        <ProjectForm cancelHref="/inventory?tab=projects" />
      </FormPage>
    );
  }
  const allowedTypes = [
    ...(can(user, "inventory.projects", "create") ? ["project"] : []),
    ...(can(user, "inventory.units", "create") ? ["resale", "rental"] : []),
  ];
  if (!allowedTypes.length) redirect("/inventory");
  const [projects, owners] = await Promise.all([
    db.project.findMany({ include: { blocks: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } }),
    assignableUsers(user, "inventory.units"),
  ]);
  return (
    <FormPage title="Add unit / listing" backHref="/inventory" backLabel="Inventory">
      <UnitForm projects={projects} owners={owners} currentUserId={user.id} cancelHref="/inventory" allowedTypes={allowedTypes} />
    </FormPage>
  );
}
