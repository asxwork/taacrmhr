"use client";
import { useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { quickProof } from "./actions";

/** Red "Add bill" pill on entries without proof: pick a file / take a photo and it's attached at once. */
export function QuickProof({ id }: { id: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form ref={form} action={async (fd) => { setBusy(true); setErr(null); setErr(await quickProof(fd)); setBusy(false); }}>
      <input type="hidden" name="id" value={id} />
      <label title="Attach the bill, receipt or screenshot" className="relative inline-flex cursor-pointer items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100">
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />}{busy ? "Uploading…" : "Add bill"}
        <input type="file" name="proofs" accept="image/*,application/pdf" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.length && form.current?.requestSubmit()} />
      </label>
      {err && <span role="alert" className="mt-1 block max-w-48 text-[11px] leading-tight text-red-600">{err}</span>}
    </form>
  );
}
