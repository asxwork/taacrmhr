"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeTab, type SectionTab } from "@/lib/sections";

/** The screens of the current section as tabs across the top of the page (filtered to what the user may open). */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const path = usePathname();
  const params = useSearchParams();
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
