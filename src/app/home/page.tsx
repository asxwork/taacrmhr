import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { appsForUser } from "@/lib/apps";
import { layoutsFor } from "@/lib/layouts";
import { unreadCount } from "@/lib/notify";
import { logout } from "@/app/login/actions";
import { NAV_ICONS } from "@/components/nav-icons";

export const metadata = { title: "Apps" };

/** Odoo-style home: after signing in people choose an app (CRM, HR, My Space…). Only their apps are shown. */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const [apps, layouts, sp] = await Promise.all([appsForUser(user), layoutsFor(user), searchParams]);
  if (apps.length === 1) redirect(apps[0]!.start);
  // Settings → Layouts → "All apps": a start page sends people straight to work after sign-in ("All apps" still opens this).
  const landing = layouts.get("home")?.landing;
  if (landing && !sp.all) redirect(landing);
  const unread = await unreadCount(user.id);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="relative min-h-screen overflow-hidden bg-navy-950 px-5 pb-16 pt-6 text-white sm:px-10">
      {user.viewAs && (
        <div className="relative z-10 -mx-5 -mt-6 mb-6 flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-navy-950 sm:-mx-10">
          Viewing as <b>{user.name}</b> · read-only
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/view-as?exit=1" className="rounded-md bg-navy-950 px-3 py-1 text-xs font-semibold text-white">Exit, back to {user.viewAs.realName}</a>
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-gold-400/10 blur-3xl" />

      <header className="relative mx-auto flex max-w-5xl items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-10 w-auto sm:h-12" />
        <span className="flex-1" />
        <Link href="/notifications" className="relative flex size-10 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-semibold text-navy-950">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <form action={logout}>
          <button className="flex size-10 items-center justify-center rounded-lg text-white/60 hover:bg-red-500/15 hover:text-red-300" aria-label="Sign out" title="Sign out"><LogOut className="size-5" /></button>
        </form>
      </header>

      <section className="relative mx-auto mt-14 max-w-5xl">
        <p className="text-sm text-gold-300/90">{greeting},</p>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">{user.name.split(" ")[0]}</h1>
        <p className="mt-2 text-white/60">Where would you like to work?</p>

        <ul className="stagger mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {apps.map((app) => {
            const Icon = NAV_ICONS[app.icon] ?? NAV_ICONS.home!;
            return (
              <li key={app.key}>
                <Link href={app.start} className="group flex h-full flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08]">
                  <span className={`flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${app.tile} shadow-lg shadow-black/30 transition group-hover:scale-105`}>
                    <Icon className="size-8 text-white" />
                  </span>
                  <span className="font-medium">{app.name}</span>
                  <span className="text-xs leading-snug text-white/50">{app.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
