"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Lists remember how you left them (search, filters, page, view) for this browser tab, so "← back" links from a
// record return you to the same list instead of its default view.
const KEY = (path: string) => `ams:list:${path}`;
const DRAWERS = ["new", "edit", "open", "members", "convert", "correct", "editPunch", "a", "import", "past", "bulk"];

/** In the app frame: notes the current address of every page (filters included) as you go. */
export function ListMemory() {
  const path = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    const p = new URLSearchParams(params.toString());
    if (DRAWERS.some((k) => p.has(k))) return; // an open form isn't how the list was left
    try { sessionStorage.setItem(KEY(path), p.size ? `${path}?${p}` : path); } catch { /* private mode */ }
  }, [path, params]);
  return null;
}

/** The address this list was last left at in this tab; else the link as given (which may carry its own defaults). */
export function rememberedHref(href: string) {
  if (typeof window === "undefined") return href;
  try { return sessionStorage.getItem(KEY(href.split(/[?#]/)[0]!)) ?? href; } catch { return href; }
}

/** A link back to a list that returns to it as it was left. */
export function ListLink({ href, ...rest }: React.ComponentProps<typeof Link> & { href: string }) {
  const [to, setTo] = useState(href);
  useEffect(() => setTo(rememberedHref(href)), [href]);
  return <Link href={to} {...rest} />;
}
