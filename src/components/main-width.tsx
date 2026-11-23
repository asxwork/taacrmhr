"use client";

import { usePathname } from "next/navigation";

// Big lists (leads, deals, contacts, inventory, follow-ups…) use the whole screen width; other pages keep a readable width.
const WIDE = /^\/(crm\/(leads|deals|contacts|companies|follow-ups|tasks|duplicates)|inventory)\/?$/;

export function MainWidth({ children }: { children: React.ReactNode }) {
  const wide = WIDE.test(usePathname() ?? "");
  return <div className={`mx-auto px-4 pb-24 pt-6 sm:px-8 sm:pt-8 lg:pb-10 ${wide ? "max-w-none 2xl:px-10" : "max-w-6xl"}`}>{children}</div>;
}
