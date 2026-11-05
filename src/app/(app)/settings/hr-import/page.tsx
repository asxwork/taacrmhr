import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { smtpConfigured } from "@/lib/mail";
import { PageHeader } from "@/components/ui";
import { HrImporter } from "./importer";

export const metadata = { title: "Import HR data" };

/** Super Admin: brings employees, attendance, leave and past payroll over from the old HR system (adds, never deletes). */
export default async function HrImportPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Import HR data" description="Upload the Excel reports from your old HR system to add employees, attendance, leave and past payroll to AMS. Nothing is deleted. The files are read once and never stored." />
      <HrImporter smtp={smtpConfigured()} waiting={await db.user.count({ where: { active: true, lastLoginAt: null, id: { not: user.id } } })} />
    </div>
  );
}
