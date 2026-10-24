"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Briefcase, Building2, CalendarDays, Clock, Contact, Handshake, History, House, Laptop, LogOut, Menu, Plane,
  Receipt, Settings, Shield, SlidersHorizontal, Target, TrendingUp, User, Users, Wallet, X,
} from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: House, target: Target, handshake: Handshake, contact: Contact, calendar: CalendarDays, building: Building2,
  chart: BarChart3, users: Users, clock: Clock, plane: Plane, wallet: Wallet, briefcase: Briefcase, trending: TrendingUp,
  receipt: Receipt, laptop: Laptop, user: User, shield: Shield, settings: Settings, sliders: SlidersHorizontal, history: History,
};

export function Sidebar({ groups, user }: { groups: NavGroup[]; user: { name: string; roles: string; branch: string | null } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g, i) => (
        <div key={g.label ?? i}>
          {g.label && <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-white/35">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? House;
              const active = pathname === item.href || (item.href !== "/me" && pathname.startsWith(item.href + "/"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition",
                      active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-400" />}
                    <Icon className={cn("size-4", active ? "text-gold-400" : "text-white/45")} />
                    <span className="flex-1">{item.label}</span>
                    {item.phase && <span className="text-[10px] text-white/30">soon</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const panel = (
    <div className="flex h-full w-60 flex-col bg-navy-900">
      <div className="flex h-16 items-center px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-11 w-auto" />
      </div>
      {nav}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-white/45">
              {user.roles}
              {user.branch && ` · ${user.branch}`}
            </p>
          </div>
          <form action={logout}>
            <button className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">{panel}</aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-navy-900 px-4 lg:hidden">
        <button onClick={() => setOpen(true)} className="text-white/80" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-9 w-auto" />
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
          <div className="relative h-full w-60">
            {panel}
            <button onClick={() => setOpen(false)} className="absolute right-2 top-5 text-white/60" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
