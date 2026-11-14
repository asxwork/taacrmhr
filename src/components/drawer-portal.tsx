"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Puts a side panel directly on <body>, so nothing on the page (animations, tables, scroll areas) can box it in,
 * and stops the page behind it from scrolling while it's open.
 */
export function DrawerPortal({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.body);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return host ? createPortal(children, host) : <>{children}</>;
}
