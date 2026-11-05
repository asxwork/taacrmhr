import Link from "@/components/link";
import { format } from "date-fns";
import { MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { APP_URL } from "@/lib/notify";
import { waHref } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { createInvite } from "./actions";

export const metadata = { title: "Onboarding links" };

/** HR → Onboarding links: send a new hire a link to fill in their own details, photo and CNIC. */
export default async function OnboardingPage() {
  const user = await requirePermission("hr.onboarding");
  const [invites, employees] = await Promise.all([
    db.onboardingInvite.findMany({ include: { employee: { select: { id: true, fullName: true, phone: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: [{ joiningDate: "desc" }], take: 300 }),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader title="Onboarding links" description="Add the new hire in Employees first, then create a link here and send it. They fill in their personal details, CNIC, photo, emergency contact and bank account — no login needed. Links work for 14 days, once." />
      {can(user, "hr.onboarding", "create") && (
        <Card className="mb-4 p-4">
          <ActionForm action={createInvite} className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 text-sm"><span className="mb-1 block font-medium">New hire</span>
              <select name="employeeId" required className="input"><option value="">Choose an employee</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.code ? ` · ${e.code}` : ""}</option>)}</select>
            </label>
            <SubmitButton>Create link</SubmitButton>
          </ActionForm>
        </Card>
      )}
      <Card className="overflow-hidden">
        {invites.length === 0 ? <EmptyState title="No links yet" /> : (
          <ul className="divide-y divide-line">
            {invites.map((i) => {
              const url = `${APP_URL()}/onboard/${i.token}`;
              const state = i.submittedAt ? <Badge tone="green">Submitted {format(i.submittedAt, "d MMM")}</Badge> : i.expiresAt < now ? <Badge>Expired</Badge> : <Badge tone="amber">Waiting · until {format(i.expiresAt, "d MMM")}</Badge>;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/hr/employees/${i.employee.id}`} className="font-medium text-navy-900 hover:underline">{i.employee.fullName}</Link>
                    {!i.submittedAt && i.expiresAt > now && <input readOnly value={url} aria-label="Onboarding link" className="input mt-1 h-8 w-full font-mono text-xs" />}
                  </div>
                  {state}
                  {!i.submittedAt && i.expiresAt > now && i.employee.phone && (
                    <a href={`${waHref(i.employee.phone)}?text=${encodeURIComponent(`Welcome to The Advisor Associates! Please fill in your details for HR here: ${url}`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"><MessageCircle className="size-4" /> WhatsApp</a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
