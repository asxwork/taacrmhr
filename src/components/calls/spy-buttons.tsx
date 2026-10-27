"use client";

import { Ear, MessageSquareQuote, Users } from "lucide-react";
import { useSoftphone } from "./softphone";

/** Wallboard: listen to, whisper to, or join an agent's live call through the supervisor's own softphone. */
export function SpyButtons({ extension }: { extension: string }) {
  const phone = useSoftphone();
  if (!phone || phone.status !== "ready" || !phone.spyCodes || phone.extension === extension) return null;
  const kinds = ([["listen", "Listen", Ear], ["whisper", "Whisper", MessageSquareQuote], ["barge", "Barge", Users]] as const).filter(([k]) => phone.spyCodes![k]);
  if (!kinds.length) return null;
  return (
    <div className="mt-3 flex gap-2">
      {kinds.map(([k, label, Icon]) => (
        <button key={k} type="button" disabled={!!phone.call} onClick={() => phone.spy(k, extension)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-xs font-medium hover:bg-canvas disabled:opacity-50">
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
