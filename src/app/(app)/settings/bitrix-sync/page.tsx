import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { syncStatus } from "@/lib/bitrix-sync";
import { PageHeader } from "@/components/ui";
import { SyncPanel } from "./sync-panel";

export const metadata = { title: "Bitrix sync" };

export default async function BitrixSyncPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Bitrix sync" description="While your team still works in Bitrix24, AMS keeps itself updated: new leads, changed stages and responsible people, new activities, comments and stage changes come in automatically." />
      <SyncPanel initial={await syncStatus()} />
    </div>
  );
}
