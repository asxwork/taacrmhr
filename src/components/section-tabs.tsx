"use client";

import Link from "@/components/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeTab, underNestedTab, type Section, type SectionTab } from "@/lib/sections";

/**
 * The screens of the current section as tabs across the top of the page (filtered to what the user may open).
 * Picked here from the address on every page change: the page frame (layout) isn't re-rendered when you move
 * between sections, so tabs worked out there went stale.
 */
export function SectionTabs({ sections, app }: { sections: Section[]; app?: string }) {
  const path = usePathname();
  const params = useSearchParams();
  const pathOf = (h: string) => h.split("?")[0];
  const exact = sections.filter((s) => s.tabs.some((t) => pathOf(t.href) === path));
  const hits = exact.length ? exact : sections.filter((s) => s.tabs.some((t) => underNestedTab(t, path)));
  const section = hits.find((s) => s.app && path.startsWith("/me")) ?? hits.find((s) => !s.app || s.app === app) ?? hits[0];
  const tabs: SectionTab[] = section?.tabs ?? [];
  const active = activeTab(tabs, path, params);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Section" className="-mx-1 mb-5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const on = active?.href === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors", on ? "border-navy-900 font-medium text-ink" : "border-transparent text-muted hover:border-line hover:text-ink")}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
