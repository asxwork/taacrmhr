import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BitrixImporter } from "./importer";

export const metadata = { title: "Import from Bitrix" };

export default async function BitrixImportPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Import leads from Bitrix24" description="Bring in your Bitrix leads with their activities (tasks, to-dos, calls) and stage history. Optionally delete the demo leads first." />
      <BitrixImporter />
    </div>
  );
}
