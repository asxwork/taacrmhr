"use client";

import Link from "@/components/link";
import { useState } from "react";
import { CalendarDays, ChevronRight, Clock, LayoutList, Search, Timer, Users } from "lucide-react";

type Item = { key: string; name: string; group: string; desc: string; href: string };
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { Daily: Clock, Calendars: CalendarDays, Summaries: LayoutList, "Late & early": Timer, "By group": Users, Planning: CalendarDays };

/** All attendance report templates, grouped, with a search box. */
export function AttTemplateList({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const shown = items.filter((i) => !q || `${i.name} ${i.desc} ${i.group}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <>
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a report, e.g. late, calendar, branch" className="input pl-9" aria-label="Find a report" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const list = shown.filter((i) => i.group === g);
          if (!list.length) return null;
          const Icon = ICONS[g] ?? LayoutList;
          return (
            <section key={g} className="card rounded-xl border border-line bg-surface">
              <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold"><Icon className="size-4 text-gold-600" />{g}</h2>
              <ul className="p-1.5">
                {list.map((i) => (
                  <li key={i.key}>
                    <Link href={i.href} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-canvas">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{i.name}</span>
                        <span className="block truncate text-xs text-muted">{i.desc}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted/50 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {!shown.length && <p className="py-10 text-center text-sm text-muted">No report matches “{q}”.</p>}
    </>
  );
}
