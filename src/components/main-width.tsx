"use client";

import { usePathname } from "next/navigation";

// Big lists (leads, deals, contacts, inventory, follow-ups…) use the whole screen width; other pages keep a readable width.
const WIDE = /^\/(crm\/(leads|deals|contacts|companies|follow-ups|tasks|duplicates)|inventory)\/?$/;

export function MainWidth({ children }: { children: React.ReactNode }) {
  const wide = WIDE.test(usePathname() ?? "");
  return wide
    ? <div data-wide="" className="mx-auto max-w-none px-3 pb-24 pt-3 sm:px-4 sm:pt-3 lg:pb-3 2xl:px-6">{children}</div>
    : <div className="mx-auto max-w-6xl px-3 pb-24 pt-3 sm:px-8 sm:pt-8 lg:pb-10">{children}</div>;
}
