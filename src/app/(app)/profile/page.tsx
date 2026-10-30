import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MyEmployment } from "../me/my-employment";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";

export const metadata = { title: "My profile" };

/**
 * My profile — the same ResourceInn-style profile in every app (CRM, HR, Calls, My Space): opened from the name
 * at the bottom of the sidebar, and it keeps the menu of the app you came from.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (emp) return <MyEmployment userId={user.id} />;
  // Logins without an HR record (e.g. an outside sales partner) still get a basic profile.
  return (
    <>
      <PageHeader title="My profile" />
      <Card className="max-w-xl p-6">
        <div className="flex items-center gap-4">
          <PersonAvatar name={user.name} photo={null} className="size-16 text-lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">{user.roleNames.map((r) => <Badge key={r}>{r}</Badge>)}</div>
          </div>
        </div>
        <p className="mt-5 text-sm text-muted">HR hasn’t created an employee record for your login yet, so your full profile (personal, employment, salary and documents) isn’t available. Ask HR to link your login to your employee record.</p>
      </Card>
    </>
  );
}
