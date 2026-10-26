"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

/**
 * GET filter form that applies itself: dropdowns, dates and checkboxes apply at once, text after a short
 * pause in typing. No "Apply" button needed. Empty fields are left out of the URL.
 */
export function AutoFilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const form = useRef<HTMLFormElement>(null);

  function apply() {
    if (!form.current) return;
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form.current)) if (typeof v === "string" && v !== "") p.append(k, v);
    startTransition(() => router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false }));
  }

  function onChange(e: React.FormEvent<HTMLFormElement>) {
    const el = e.target as HTMLInputElement;
    const typing = el.tagName === "INPUT" && ["text", "search", "tel", "email", ""].includes(el.type);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, typing ? 400 : 0);
  }

  return (
    <form ref={form} className={className} onChange={onChange} onSubmit={(e) => { e.preventDefault(); apply(); }} aria-busy={pending} data-pending={pending || undefined}>
      {children}
    </form>
  );
}
