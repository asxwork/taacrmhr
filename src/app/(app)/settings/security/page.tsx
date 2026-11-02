import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeWindow, securitySettings, windowFromRoles } from "@/lib/security";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { saveSecurity } from "./actions";

export const metadata = { title: "Security" };

/** Settings → Security (Super Admin): idle sign-out, two-step login policy, and an overview of sign-in hours. */
export default async function SecurityPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const [s, roles, users] = await Promise.all([
    securitySettings(),
    db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, loginFrom: true, loginTo: true, loginDays: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, isSuperAdmin: true, totpEnabled: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Security" description="Sign-in rules for everyone. Sign-in hours are set per role in Roles & Permissions." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-6">
          <ActionForm action={saveSecurity} className="space-y-5">
            <Field label="Sign out after inactivity" hint="0 = never. Everyone is signed out after this many minutes without using AMS (useful on shared office computers).">
              <div className="flex items-center gap-2"><input name="idleMinutes" type="number" min={0} max={480} defaultValue={s.idleMinutes} className="input w-28" /><span className="text-sm text-muted">minutes</span></div>
            </Field>
            <Field label="Two-step login required for" hint="People who must use it are taken to set it up after signing in. Anyone can turn it on for themselves under My profile.">
              <select name="require2fa" defaultValue={s.require2fa} className="input w-64">
                <option value="none">Nobody (optional)</option>
                <option value="superadmin">Super Admins</option>
                <option value="all">Everyone</option>
              </select>
            </Field>
            {!user.totpEnabled && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Turn on <Link href="/profile/security" className="font-medium underline">two-step login for yourself</Link> before requiring it.</p>}
            <SubmitButton>Save security</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold">Sign-in hours by role</p>
            <ul className="space-y-1.5 text-sm">
              {roles.map((r) => {
                const w = windowFromRoles([r]);
                return <li key={r.id} className="flex justify-between gap-3"><Link href={`/settings/roles/${r.id}`} className="hover:underline">{r.name}</Link><span className="text-xs text-muted">{w ? describeWindow(w) : "Any time"}</span></li>;
              })}
            </ul>
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold">Two-step login</p>
            <ul className="space-y-1.5 text-sm">
              {users.map((u) => <li key={u.id} className="flex justify-between gap-3"><span>{u.name}{u.isSuperAdmin && <span className="ml-1 text-xs text-muted">Super Admin</span>}</span>{u.totpEnabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</li>)}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
