"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A ready-to-paste text block (e.g. the calls report for WhatsApp) with a Copy button. */
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap rounded-lg bg-canvas px-4 py-3 pr-24 font-sans text-sm leading-relaxed">{text}</pre>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
        className="absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium hover:bg-canvas">
        {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {done ? "Copied" : label}
      </button>
    </div>
  );
}
