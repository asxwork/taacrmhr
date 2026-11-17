"use client";

import { createContext, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

/** Where a form inside a drawer / dialog goes after it saves: back to the page behind it. */
export const AfterSaveContext = createContext<string | null>(null);
export function AfterSave({ href, children }: { href: string; children: React.ReactNode }) {
  return <AfterSaveContext.Provider value={href}>{children}</AfterSaveContext.Provider>;
}

const KEY = "ams-flash";
/** Keep a success message for the next page (a closed drawer would otherwise swallow it). */
export function flash(message: string) {
  try { sessionStorage.setItem(KEY, message); } catch {}
}

/** Shows the saved message briefly after the drawer closed. Mounted once in the app frame. */
export function FlashToast() {
  const path = usePathname();
  const params = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let m: string | null = null;
    try { m = sessionStorage.getItem(KEY); if (m) sessionStorage.removeItem(KEY); } catch {}
    if (!m) return;
    setMsg(m);
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [path, params]);
  if (!msg) return null;
  return (
    <div role="status" className="anim-fade fixed bottom-6 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-2 rounded-xl bg-navy-950 px-4 py-3 text-sm text-white shadow-2xl">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> <span>{msg}</span>
    </div>
  );
}
