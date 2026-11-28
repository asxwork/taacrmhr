"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A small "Copy link" button. */
export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas">
      {done ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />} {done ? "Copied" : label}
    </button>
  );
}
