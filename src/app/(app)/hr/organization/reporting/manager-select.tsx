"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setLineManager } from "./actions";

/** Line-manager dropdown that saves the moment it changes, with a spinner, a tick, or the reason it was refused. */
export function ManagerSelect({ employeeId, value, options, disabled }: { employeeId: string; value: string; options: { id: string; name: string }[]; disabled?: boolean }) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text?: string } | null>(null);
  const change = (next: string) => {
    const prev = current;
    setCurrent(next);
    start(async () => {
      const res = await setLineManager(employeeId, next || null);
      if (res.error) { setCurrent(prev); setMsg({ ok: false, text: res.error }); }
      else { setMsg({ ok: true }); setTimeout(() => setMsg(null), 1500); }
    });
  };
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <select value={current} onChange={(e) => change(e.target.value)} disabled={disabled || pending} aria-label="Line manager"
          className={cn("input h-9 w-full min-w-48 transition-shadow", msg?.ok && "ring-2 ring-emerald-400", !current && "text-muted")}>
          <option value="">No line manager</option>
          {options.filter((o) => o.id !== employeeId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <span className="w-4 shrink-0">{pending ? <Loader2 className="size-4 animate-spin text-muted" /> : msg?.ok ? <Check className="size-4 text-emerald-600" /> : null}</span>
      </span>
      {msg && !msg.ok && <span className="text-xs text-red-600">{msg.text}</span>}
    </span>
  );
}
