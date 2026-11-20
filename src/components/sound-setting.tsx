"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { playAmsSound, setSoundOn, soundOn, type AmsSound } from "@/lib/ams-sound";

/** Profile → Notifications: the AMS sound on or off on this device, and a preview of each sound. */
export function SoundSetting() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundOn()), []);
  const toggle = () => { setSoundOn(!on); setOn(!on); if (!on) playAmsSound("notify", { force: true }); };
  const tries: [AmsSound, string][] = [["notify", "Notification"], ["urgent", "Urgent"], ["chat", "Chat message"]];
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={on} onChange={toggle} className="mt-1 accent-navy-900" />
        <span><span className="flex items-center gap-1.5 text-sm font-medium">{on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} Play the AMS sound for new notifications</span>
          <span className="block text-xs text-muted">While AMS is open in a tab. Saved on this device (set it on each phone or computer).</span></span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2 pl-7">
        {tries.map(([k, label]) => <button key={k} type="button" onClick={() => playAmsSound(k, { force: true })} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-canvas">▶ {label}</button>)}
      </div>
    </div>
  );
}
