"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";

/** Dialer → Campaign box: switch between my campaigns (saved at once, the next number comes from the one picked). */
export function CampaignSwitch({ action, value, options }: { action: (fd: FormData) => Promise<void>; value: string; options: { id: string; label: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="relative mt-0.5 inline-block max-w-full">
      <select name="campaignId" defaultValue={value} onChange={() => form.current?.requestSubmit()} aria-label="Campaign to call from"
        className="max-w-full cursor-pointer appearance-none truncate rounded-lg border border-line bg-surface py-1.5 pl-3 pr-9 text-base font-semibold hover:border-navy-900/40 focus:outline-none focus:ring-2 focus:ring-navy-900/20">
        {options.map((o) => <option key={o.id || "all"} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </form>
  );
}
