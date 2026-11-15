"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { markSent } from "@/app/(app)/invoices/actions";

/** WhatsApp and Copy link for the client's invoice link; either counts as sent. */
export function ShareButtons({ id, url, phone, text }: { id: string; url: string; phone: string | null; text: string }) {
  const [copied, setCopied] = useState(false);
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0/, "92");
  const wa = `https://wa.me/${digits}?text=${encodeURIComponent(`${text}\n${url}`)}`;
  return (
    <div className="flex flex-wrap gap-2">
      <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => markSent(id, "Shared on WhatsApp")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#25D366]/50 px-3 text-sm font-medium text-[#128C7E] hover:bg-[#25D366]/10"><MessageCircle className="size-4" /> WhatsApp</a>
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); void markSent(id, "Link copied"); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><Copy className="size-4" /> {copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
