"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies text to the clipboard and shows a tick for a moment. */
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-canvas" aria-label={label}>
      {done ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />} {done ? "Copied" : label}
    </button>
  );
}
