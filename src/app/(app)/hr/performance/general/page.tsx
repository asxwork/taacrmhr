import { requirePermission, scopeFor } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { PerfSettingsForm } from "@/components/hr/perf-settings-form";

export const metadata = { title: "Assessment Settings · General" };

export default async function Page() {
  const user = await requirePermission("hr.performance");
  return (
    <>
      <PageHeader title="General" description="How appraisal cycles start." />
      <PerfSettingsForm part="general" canEdit={user.isSuperAdmin || scopeFor(user, "hr.performance", "edit") === "all"} />
    </>
  );
}
