import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Badge, Card, Field, PageHeader } from "@/components/ui";
import { changePassword } from "./actions";

export const metadata = { title: "My Profile" };

export default async function MePage() {
  const session = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: session.id }, include: { branch: true, manager: true } });

  const rows: [string, React.ReactNode][] = [
    ["Email", user.email],
    ["Phone", user.phone || "—"],
    ["Branch", user.branch?.name || "—"],
    ["Reports to", user.manager?.name || "—"],
    ["Member since", fmtDate(user.createdAt)],
  ];

  return (
    <>
      <PageHeader title="My Profile" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-4">
            <Avatar name={user.name} className="size-14 text-base" />
            <div>
              <p className="text-lg font-semibold">{user.name}</p>
              <p className="text-sm text-muted">{user.title || "—"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {session.roleNames.map((r) => (
                  <Badge key={r} tone="navy">{r}</Badge>
                ))}
              </div>
            </div>
          </div>
          <dl className="divide-y divide-line">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between py-2.5 text-sm">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs text-muted">Attendance, leave and payslips will appear here as HR modules go live.</p>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-medium">Change password</h2>
          <ActionForm action={changePassword} className="space-y-4" successMessage="Password updated.">
            <Field label="Current password">
              <input name="current" type="password" required className="input" autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <input name="next" type="password" required minLength={8} className="input" autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <input name="confirm" type="password" required className="input" autoComplete="new-password" />
            </Field>
            <SubmitButton>Update password</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
