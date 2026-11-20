"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { playAmsSound, unlockSound } from "@/lib/ams-sound";

/**
 * Checks for new notifications every 20 seconds while AMS is open (paused in a hidden tab). Something new: the AMS
 * chime plays (urgent and chat have their own sound) and the page refreshes its badges.
 */
export function NotificationPulse({ unread, chat }: { unread: number; chat: number }) {
  const router = useRouter();
  const seen = useRef<{ unread: number; chat: number; latest: string | null }>({ unread, chat, latest: null });
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      try {
        const r = await fetch("/api/notifications/pulse", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { unread: number; urgent: number; chat: number; latest: { id: string; priority: string } | null };
        const s = seen.current;
        const newNote = d.unread > s.unread || (!!d.latest && !!s.latest && d.latest.id !== s.latest && d.unread >= s.unread);
        const newChat = d.chat > s.chat && s.chat >= 0;
        if (newNote) playAmsSound(d.latest?.priority === "urgent" ? "urgent" : "notify");
        else if (newChat) playAmsSound("chat");
        const changed = d.unread !== s.unread || d.chat !== s.chat;
        seen.current = { unread: d.unread, chat: d.chat, latest: d.latest?.id ?? null };
        if (changed) router.refresh();
      } catch { /* offline: try again next time */ }
    };
    // First check just records the newest one (no sound for what was already there when the page opened).
    void fetch("/api/notifications/pulse", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => { if (d) seen.current.latest = d.latest?.id ?? null; }).catch(() => {});
    const t = setInterval(tick, 20_000);
    const onShow = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [router]);
  // Server-rendered counts change after a refresh: keep the baseline in step.
  useEffect(() => { seen.current.unread = unread; seen.current.chat = chat; }, [unread, chat]);
  return null;
}
