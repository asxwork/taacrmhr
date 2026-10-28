"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Re-runs a short fade/slide-up when the route changes (not when only search params change, e.g. drawers).
 * The animation is restarted on the same element rather than remounting the page with a `key`: remounting
 * while a page is still streaming in made React lose its place during hydration.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (!el) return;
    el.classList.remove("anim-page");
    void el.offsetWidth; // reflow so the animation starts again
    el.classList.add("anim-page");
  }, [pathname]);
  return <div ref={ref} className="anim-page">{children}</div>;
}
