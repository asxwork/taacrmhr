import { requirePermission, scopeFor } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { PerfSettingsForm } from "@/components/hr/perf-settings-form";

export const metadata = { title: "Assessment Settings · Performance" };

export default async function Page() {
  const user = await requirePermission("hr.performance");
  return (
    <>
      <PageHeader title="Performance" description="Probation evaluation criteria and reminders." />
      <PerfSettingsForm part="probation" canEdit={user.isSuperAdmin || scopeFor(user, "hr.performance", "edit") === "all"} />
    </>
  );
}
