"use client";

import { usePathname } from "next/navigation";

/** Re-runs a short fade/slide-up when the route changes (not when only search params change, e.g. drawers). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="anim-page">{children}</div>;
}
