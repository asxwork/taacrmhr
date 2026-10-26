"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, ChevronRight, House, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { appForPath, sidebarMode, type AppKey, type NavGroup, type NavItem } from "@/lib/nav";
import type { UserApp } from "@/lib/apps";
import { cn, initials } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import { openSearch } from "./command-palette";
import { NAV_ICONS } from "./nav-icons";

const ICONS = NAV_ICONS;

type Props = { apps: UserApp[]; initialApp: AppKey; user: { name: string; roles: string; branch: string | null }; unread: number; initiallyCollapsed: boolean };

const pathOf = (href: string) => href.split(/[?#]/)[0]!;
const isActive = (pathname: string, href: string) => {
  const path = pathOf(href);
  return pathname === path || (path !== "/me" && path !== "/hr" && pathname.startsWith(path + "/"));
};

export function Sidebar({ apps, initialApp, user, unread, initiallyCollapsed }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false); // phone drawer
  const [collapsed, setCollapsed] = useState(initiallyCollapsed); // desktop rail (the user's choice)
  const [hovered, setHovered] = useState(false); // rail temporarily opened by hovering
  const [switcher, setSwitcher] = useState(false); // app menu
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The app follows the page; shared pages (notifications…) keep the last app.
  const pathApp = appForPath(apps, pathname);
  const [lastKey, setLastKey] = useState<AppKey>(initialApp);
  useEffect(() => {
    if (!pathApp) return;
    setLastKey(pathApp.key);
    document.cookie = `app=${pathApp.key}; path=/; max-age=31536000; samesite=lax`;
  }, [pathApp]);
  const app = pathApp ?? apps.find((a) => a.key === lastKey) ?? apps[0]!;
  const groups = app.groups;
  const modules = app.layout === "modules";
  const allItems = groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i]));
  // Only the closest item lights up (e.g. /hr/attendance/logs, not also /hr/attendance). Among links to the
  // same page, the one whose ?query matches the URL wins, then the plain link.
  const query = params.toString();
  const score = (href: string) => {
    const [, q = ""] = href.split("#")[0]!.split("?");
    return pathOf(href).length * 4 + (q && query.includes(q) ? 2 : 0) + (q || href.includes("#") ? 0 : 1) - (q && !query.includes(q) ? 4 : 0);
  };
  const activeHref = allItems.filter((i) => isActive(pathname, i.href)).sort((a, b) => score(b.href) - score(a.href))[0]?.href;
  const isCurrent = (href: string) => href === activeHref;
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>({});
  const quick = allItems.filter((i) => !i.phase).slice(0, 4);

  // HR: the module whose pages show in the panel. Follows the page; clicking a module on the rail picks it.
  const pageModule = groups.find((g) => g.items.some((i) => isActive(pathname, i.href)));
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [pathname]);
  const shownModule = groups.find((g) => g.label === picked) ?? pageModule ?? groups[0];

  // While creating or editing something (a /new page or a New/Edit panel) the sidebar folds away to give
  // the form room; it comes back by itself afterwards. Hovering the rail still opens it.
  const creating = pathname.endsWith("/new") || ["new", "edit", "import", "convert"].some((k) => params.has(k));
  const rail = collapsed || creating;
  const showRail = rail && !hovered;

  // The page shell's left padding follows the rail (not the hover overlay, which floats above the page).
  useEffect(() => {
    document.querySelector("[data-sidebar]")?.setAttribute("data-sidebar", sidebarMode(app.layout, rail));
  }, [rail, app.layout]);
  useEffect(() => { setHovered(false); setSwitcher(false); }, [pathname, params]);

  // Remember the choice (cookie, so the server renders the right width with no flash).
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    setHovered(false);
    document.cookie = `sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }
  const hoverOpen = () => {
    if (!rail) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(true), 120);
  };
  const hoverClose = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(false);
    setSwitcher(false);
  };

  // Close the phone drawer / app menu with Escape.
  useEffect(() => {
    if (!open && !switcher) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setSwitcher(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, switcher]);

  const itemLink = (item: NavItem, rail: boolean) => {
    const Icon = ICONS[item.icon] ?? House;
    const active = isCurrent(item.href);
    return (
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
    );
  };

  const navList = (rail: boolean, list: NavGroup[] = groups) => (
    <nav aria-label={app.name} className={cn("sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-3", rail ? "rail-scroll px-0" : "px-3")}>
      {list.map((g, i) => (
        <div key={g.label ?? i} className={cn(i > 0 && "mt-5")}>
          {g.label && (rail
            ? <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden />
            : <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-white/50">{g.label}</p>)}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              if (!item.children || rail) return <li key={item.label}>{itemLink(item, rail)}</li>;
              // Sub-menu: open while one of its pages is current, or when the user opens it.
              const key = `${g.label}/${item.label}`;
              const hasCurrent = item.children.some((c) => isCurrent(c.href));
              const isOpen = openSubs[key] ?? hasCurrent;
              const Icon = ICONS[item.icon] ?? House;
              return (
                <li key={item.label}>
                  <button type="button" onClick={() => setOpenSubs((o) => ({ ...o, [key]: !isOpen }))} aria-expanded={isOpen}
                    className={cn("group flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] transition-colors", hasCurrent ? "text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white")}>
                    <Icon className={cn("size-[18px] shrink-0", hasCurrent ? "text-gold-400" : "text-white/55 group-hover:text-white/80")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    <ChevronRight className={cn("size-4 text-white/40 transition-transform", isOpen && "rotate-90")} />
                  </button>
                  {isOpen && <ul className="anim-fade ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">{item.children.map((c) => <li key={c.href}>{itemLink(c, false)}</li>)}</ul>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  /** ResourceInn-style module rail: icon + label per module. Clicking picks the module (or opens it when the panel is hidden). */
  const moduleRail = (panelShown: boolean) => (
    <nav aria-label={`${app.name} modules`} className="sidebar-scroll rail-scroll flex w-[5.5rem] shrink-0 flex-col gap-1 overflow-y-auto py-2">
      {groups.map((g) => {
        const Icon = ICONS[g.icon ?? g.items[0]!.icon] ?? House;
        const on = g === shownModule;
        const cls = cn("mx-1.5 flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] leading-tight transition-colors",
          on ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white");
        const body = (
          <>
            <Icon className={cn("size-5", on ? "text-gold-400" : "text-white/55")} />
            <span className="w-full truncate text-center">{g.label}</span>
          </>
        );
        return panelShown && g.items.length > 1
          ? <button key={g.label} type="button" onClick={() => setPicked(g.label ?? null)} className={cls} aria-pressed={on}>{body}</button>
          : <Link key={g.label} href={g.items[0]!.href} onClick={() => setPicked(g.label ?? null)} className={cls} aria-current={on ? "page" : undefined}>{body}</Link>;
      })}
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

  /** App switcher: current app with a menu of the others and "All apps" (/home). */
  const appSwitcher = (compact: boolean) => {
    const AppIcon = ICONS[app.icon] ?? House;
    if (compact) {
      return (
        <Link href="/home" title={`${app.name} · all apps`} aria-label="All apps" className="mx-auto mb-1 flex size-10 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white">
          <LayoutGrid className="size-[18px]" />
        </Link>
      );
    }
    return (
      <div className="relative mx-3 mb-2">
        <button type="button" onClick={() => setSwitcher((s) => !s)} aria-expanded={switcher} aria-haspopup="menu"
          className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-white/10 px-2.5 text-left text-[13px] text-white transition-colors hover:bg-white/[0.06]">
          <span className={cn("flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-white", app.tile)}><AppIcon className="size-3.5" /></span>
          <span className="flex-1 truncate font-medium">{app.name}</span>
          <ChevronDown className={cn("size-4 text-white/50 transition-transform", switcher && "rotate-180")} />
        </button>
        {switcher && (
          <div role="menu" className="anim-fade absolute inset-x-0 top-11 z-50 rounded-xl border border-white/10 bg-navy-900 p-1.5 shadow-2xl">
            {apps.map((a) => {
              const Icon = ICONS[a.icon] ?? House;
              return (
                <Link key={a.key} href={a.start} role="menuitem" onClick={() => setOpen(false)}
                  className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors", a.key === app.key ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white")}>
                  <span className={cn("flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-white", a.tile)}><Icon className="size-3.5" /></span>
                  {a.name}
                </Link>
              );
            })}
            <Link href="/home" role="menuitem" className="mt-1 flex items-center gap-2.5 rounded-lg border-t border-white/10 px-2.5 pb-1.5 pt-2.5 text-[13px] text-white/60 hover:text-white">
              <LayoutGrid className="size-4" /> All apps
            </Link>
          </div>
        )}
      </div>
    );
  };

  const searchButton = (compact: boolean) => (
    <button
      onClick={openSearch}
      title={compact ? "Search (Ctrl+K)" : undefined}
      aria-label="Search"
      className={cn("mb-1 flex items-center gap-3 rounded-lg bg-white/[0.06] text-[13px] text-white/55 transition-colors hover:bg-white/10 hover:text-white", compact ? "mx-auto size-10 justify-center" : "mx-3 h-9 px-3")}
    >
      <Search className="size-4 shrink-0" />
      {!compact && <><span className="flex-1 text-left">Search…</span><kbd className="rounded border border-white/15 px-1.5 text-[10px]">Ctrl K</kbd></>}
    </button>
  );

  const collapseButton = (
    <button onClick={toggle} className="flex size-10 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
      title={collapsed ? "Keep the sidebar open" : "Collapse sidebar"} aria-label={collapsed ? "Keep the sidebar open" : "Collapse sidebar"}>
      {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
    </button>
  );

  return (
    <>
      {/* Desktop. Hovering the rail opens it over the page (it doesn't push content). */}
      {modules ? (
        <aside
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
          className={cn("sidebar-shell fixed inset-y-0 left-0 z-40 hidden flex-col bg-navy-950 lg:flex", showRail ? "w-[5.5rem]" : "w-[19.5rem]", rail && hovered && "shadow-2xl shadow-navy-950/40")}
          aria-label="Sidebar"
        >
          {/* One logo across the top: the icon on the bare rail, the full wordmark when the panel is open. */}
          <div className={cn("flex h-16 shrink-0 items-center border-b border-white/[0.06]", showRail ? "justify-center" : "justify-between pl-5 pr-2")}>
            {showRail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/icon.svg" alt="The Advisor Associates" className="size-9 rounded-md" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-10 w-auto" />
            )}
            {!showRail && !creating && collapseButton}
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="flex w-[5.5rem] shrink-0 flex-col border-r border-white/[0.06]">
              {showRail && !creating && <div className="mx-auto mt-2">{collapseButton}</div>}
              {showRail && appSwitcher(true)}
              {moduleRail(!showRail)}
              {showRail && footer(true)}
            </div>
            {!showRail && (
              <div className="flex min-w-0 flex-1 flex-col pt-3">
                {appSwitcher(false)}
                {searchButton(false)}
                {shownModule && navList(false, [shownModule])}
                {footer(false)}
              </div>
            )}
          </div>
        </aside>
      ) : (
        <aside
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
          className={cn("sidebar-shell fixed inset-y-0 left-0 z-40 hidden flex-col bg-navy-950 lg:flex", showRail ? "w-[4.5rem]" : "w-60", rail && hovered && "shadow-2xl shadow-navy-950/40")}
          aria-label="Sidebar"
        >
          <div className={cn("flex h-16 shrink-0 items-center", showRail ? "justify-center" : "justify-between pl-5 pr-2")}>
            {showRail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/icon.svg" alt="The Advisor Associates" className="size-9 rounded-md" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-10 w-auto" />
            )}
            {!showRail && !creating && collapseButton}
          </div>
          {showRail && !creating && <div className="mx-auto mb-1">{collapseButton}</div>}
          {appSwitcher(showRail)}
          {searchButton(showRail)}
          {navList(showRail)}
          {footer(showRail)}
        </aside>
      )}

      {/* Phone top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-navy-950 px-4 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-white/80" aria-label="Open menu" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-9 w-auto" />
        <Link href="/home" className="ml-auto rounded-lg p-1.5 text-white/80" aria-label="All apps"><LayoutGrid className="size-5" /></Link>
        <button onClick={openSearch} className="rounded-lg p-1.5 text-white/80" aria-label="Search">
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
            {appSwitcher(false)}
            {navList(false)}
            {footer(false)}
          </div>
        </div>
      )}

      {/* Phone bottom bar: this app's first 4 screens + Menu */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {quick.map((item) => {
          const Icon = ICONS[item.icon] ?? House;
          const active = isActive(pathname, item.href);
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
