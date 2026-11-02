import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { describeWindow, insideWindow } from "@/lib/security";
import { logout } from "../login/actions";

export const metadata = { title: "Outside working hours" };

/** Where people land when their role's sign-in hours are over (Roles & Permissions → Sign-in hours). */
export default async function OutsideHours() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.loginWindow || insideWindow(user.loginWindow)) redirect("/home");
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600" aria-hidden><Clock className="size-6" /></span>
        <h1 className="text-lg font-semibold">Outside working hours</h1>
        <p className="mt-2 text-sm text-muted">AMS is available to your role <b className="text-ink">{describeWindow(user.loginWindow)}</b>. Please come back then, or ask your manager if you need access now.</p>
        <form action={logout} className="mt-6"><button className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-canvas">Sign out</button></form>
      </div>
    </main>
  );
}
