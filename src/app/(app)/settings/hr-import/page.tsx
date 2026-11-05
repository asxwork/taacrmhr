import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { smtpConfigured } from "@/lib/mail";
import { PageHeader } from "@/components/ui";
import { HrImporter } from "./importer";

export const metadata = { title: "Replace HR data" };

/** Super Admin: one-time move from the old HR system. Replaces all users and HR records with the uploaded exports. */
export default async function HrImportPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Replace HR data" description="Upload the Excel reports from your old HR system to replace all users and HR records. The files are read once and never stored." />
      <HrImporter smtp={smtpConfigured()} keeping={user.email} waiting={await db.user.count({ where: { active: true, lastLoginAt: null, id: { not: user.id } } })} />
    </div>
  );
}
