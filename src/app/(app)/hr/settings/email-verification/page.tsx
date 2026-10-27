import { format } from "date-fns";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { smtpConfigured } from "@/lib/mail";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { markVerified, sendVerifications } from "../actions";

export const metadata = { title: "Email Verification" };

/** System Settings → Email Verification: confirm every login's email works, so notifications and payslips arrive. */
export default async function EmailVerification() {
  const user = await requirePermission("settings.company");
  const canEdit = user.isSuperAdmin || can(user, "settings.company", "edit");
  const [users, smtp] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, emailVerifiedAt: true, lastLoginAt: true }, orderBy: [{ emailVerifiedAt: "asc" }, { name: "asc" }] }),
    smtpConfigured(),
  ]);
  const unverified = users.filter((u) => !u.emailVerifiedAt);
  return (
    <>
      <PageHeader title="Email Verification" description="Each user gets a link by email; clicking it confirms the address works. Unverified addresses may be missing approvals, payslips and reminders."
        actions={canEdit && unverified.length > 0 && (
          <ActionForm action={sendVerifications}><SubmitButton variant="secondary" pendingText="Sending…">Send to all unverified ({unverified.length})</SubmitButton></ActionForm>
        )} />
      {!smtp && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Email sending isn’t set up yet. Add SMTP details in Settings → Integrations → Email first.</p>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">User</th><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Last sign-in</th><th className="px-4 py-2.5" /></tr></thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5 font-medium">{u.name}</td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5">{u.emailVerifiedAt ? <Badge tone="green">verified {format(u.emailVerifiedAt, "d MMM")}</Badge> : <Badge tone="amber">not verified</Badge>}</td>
                <td className="px-4 py-2.5 text-xs text-muted">{u.lastLoginAt ? format(u.lastLoginAt, "d MMM yyyy") : "never"}</td>
                <td className="px-4 py-2.5">
                  {canEdit && !u.emailVerifiedAt && (
                    <div className="flex justify-end gap-1">
                      <ActionForm action={sendVerifications}><input type="hidden" name="userId" value={u.id} /><SubmitButton variant="secondary" className="h-7 px-2.5 text-xs" pendingText="…">Send link</SubmitButton></ActionForm>
                      <form action={markVerified}><input type="hidden" name="userId" value={u.id} /><button className="h-7 rounded px-2.5 text-xs text-muted hover:bg-canvas">Mark verified</button></form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
