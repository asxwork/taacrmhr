"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, House, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { cn, initials } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import { openSearch } from "./command-palette";
import { NAV_ICONS } from "./nav-icons";

const ICONS = NAV_ICONS;

type Props = { groups: NavGroup[]; user: { name: string; roles: string; branch: string | null }; unread: number; initiallyCollapsed: boolean };

export function Sidebar({ groups, user, unread, initiallyCollapsed }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // phone drawer
  const [collapsed, setCollapsed] = useState(initiallyCollapsed); // desktop rail
  const allItems = groups.flatMap((g) => g.items);
  const quick = QUICK_ORDER.map((href) => allItems.find((i) => i.href === href)).filter((i): i is NonNullable<typeof i> => !!i && !i.phase).slice(0, 4);

  // Remember the choice (cookie, so the server renders the right width with no flash) and let the
  // page shell resize with the same animation.
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector("[data-sidebar]")?.setAttribute("data-sidebar", next ? "collapsed" : "open");
  }

  // Close the phone drawer with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navList = (rail: boolean) => (
    <nav aria-label="Main" className={cn("sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-3", rail ? "rail-scroll px-0" : "px-3")}>
      {groups.map((g, i) => (
        <div key={g.label ?? i} className={cn(i > 0 && "mt-5")}>
          {g.label && (rail
            ? <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden />
            : <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-white/50">{g.label}</p>)}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? House;
              const active = pathname === item.href || (item.href !== "/me" && pathname.startsWith(item.href + "/"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    title={rail ? item.label : undefined}
                    aria-label={rail ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg text-[13px] transition-colors duration-150",
                      rail ? "mx-auto size-10 justify-center" : "h-9 px-3",
                      active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    {active && !rail && <span className="nav-indicator absolute inset-y-2 left-0 w-[3px] rounded-full bg-gold-400" />}
                    <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-gold-400" : "text-white/55 group-hover:text-white/80")} />
                    {!rail && <span className="flex-1 truncate">{item.label}</span>}
                    {!rail && item.phase && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/45">soon</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (rail: boolean) => (
    <div className="border-t border-white/10 p-3">
      <div className={cn("flex items-center", rail ? "flex-col gap-1" : "gap-1 px-1")}>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-[11px] font-semibold text-gold-300", rail && "mb-1")} title={rail ? `${user.name} · ${user.roles}` : undefined} aria-hidden={!rail}>
          {initials(user.name)}
        </span>
        {!rail && (
          <div className="ml-1.5 min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-white/55">{user.roles}{user.branch && ` · ${user.branch}`}</p>
          </div>
        )}
        <Link href="/notifications" onClick={() => setOpen(false)} className="relative flex size-10 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white" title="Notifications" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-semibold text-navy-950">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <form action={logout} className="flex">
          <button className="flex size-10 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-red-500/15 hover:text-red-300" title="Sign out" aria-label="Sign out">
            <LogOut className="size-[18px]" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: full sidebar or icon rail */}
      <aside
        className={cn("sidebar-shell fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy-950 lg:flex", collapsed ? "w-[4.5rem]" : "w-60")}
        aria-label="Sidebar"
      >
        <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "justify-between pl-5 pr-2")}>
          {collapsed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/icon.png" alt="The Advisor Associates" className="size-9 rounded-md" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-10 w-auto" />
          )}
          {!collapsed && (
            <button onClick={toggle} className="flex size-10 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white" title="Collapse sidebar" aria-label="Collapse sidebar">
              <PanelLeftClose className="size-[18px]" />
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={toggle} className="mx-auto mb-1 flex size-10 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white" title="Expand sidebar" aria-label="Expand sidebar">
            <PanelLeftOpen className="size-[18px]" />
          </button>
        )}
        <button
          onClick={openSearch}
          title={collapsed ? "Search (Ctrl+K)" : undefined}
          aria-label="Search"
          className={cn("mb-1 flex items-center gap-3 rounded-lg bg-white/[0.06] text-[13px] text-white/55 transition-colors hover:bg-white/10 hover:text-white", collapsed ? "mx-auto size-10 justify-center" : "mx-3 h-9 px-3")}
        >
          <Search className="size-4 shrink-0" />
          {!collapsed && <><span className="flex-1 text-left">Search…</span><kbd className="rounded border border-white/15 px-1.5 text-[10px]">Ctrl K</kbd></>}
        </button>
        {navList(collapsed)}
        {footer(collapsed)}
      </aside>

      {/* Phone top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-navy-950 px-4 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-white/80" aria-label="Open menu" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-9 w-auto" />
        <button onClick={openSearch} className="ml-auto rounded-lg p-1.5 text-white/80" aria-label="Search">
          <Search className="size-5" />
        </button>
      </div>

      {/* Phone drawer: slides in from the left */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="anim-fade absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <div className="anim-slide-left relative flex h-full w-72 max-w-[85vw] flex-col bg-navy-950 shadow-2xl">
            <div className="flex h-16 shrink-0 items-center justify-between pl-5 pr-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-10 w-auto" />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {navList(false)}
            {footer(false)}
          </div>
        </div>
      )}

      {/* Phone bottom bar: the user's 4 most-used screens + Menu */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {quick.map((item) => {
          const Icon = ICONS[item.icon] ?? House;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors", active ? "font-medium text-navy-900" : "text-muted")}>
              <Icon className={cn("size-5", active && "text-gold-600")} />
              <span className="max-w-full truncate px-1">{item.label.split(" & ")[0]!.replace(/^My /, "")}</span>
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted">
          <Menu className="size-5" />
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}

const QUICK_ORDER = ["/dashboard", "/crm/leads", "/crm/tasks", "/crm/deals", "/me/attendance", "/hr/employees", "/approvals", "/me"];
