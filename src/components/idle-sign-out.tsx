"use client";

import { useEffect } from "react";

/**
 * Settings → Security → "Sign out after inactivity": signs the person out after `minutes` without using AMS in any
 * tab (activity is shared between tabs through localStorage).
 */
export function IdleSignOut({ minutes, signOut }: { minutes: number; signOut: () => Promise<void> }) {
  useEffect(() => {
    if (!minutes) return;
    const KEY = "taa_last_active";
    const mark = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} };
    const last = () => { try { return Number(localStorage.getItem(KEY)) || Date.now(); } catch { return Date.now(); } };
    mark();
    let lastMark = 0;
    const onActivity = () => { if (Date.now() - lastMark > 15_000) { lastMark = Date.now(); mark(); } };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(async () => {
      if (Date.now() - last() > minutes * 60_000) {
        clearInterval(timer);
        try { await signOut(); } catch {}
        window.location.href = "/login?idle=1";
      }
    }, 30_000);
    return () => { clearInterval(timer); events.forEach((e) => window.removeEventListener(e, onActivity)); };
  }, [minutes, signOut]);
  return null;
}
