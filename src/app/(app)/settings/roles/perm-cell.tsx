"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPermission } from "./actions";

const TONE: Record<string, string> = {
  none: "text-muted/70",
  own: "text-gold-700",
  team: "text-amber-700",
  branch: "text-sky-700",
  all: "text-navy-900 font-medium",
};

/** One matrix cell: reads like Bitrix's dotted-underline text, opens a native picker, saves on change. */
export function PermCell({ roleId, module, action, value, options, disabled }: {
  roleId: string; module: string; action: string; value: string; options: { value: string; label: string }[]; disabled?: boolean;
}) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"" | "saved" | "error">("");
  const label = options.find((o) => o.value === current)?.label ?? current;

  function change(next: string) {
    const prev = current;
    setCurrent(next);
    start(async () => {
      const res = await setPermission(roleId, module, action, next);
      if (res.error) { setCurrent(prev); setStatus("error"); }
      else { setStatus("saved"); setTimeout(() => setStatus(""), 1200); }
    });
  }

  return (
    <label className={cn("relative inline-flex max-w-full items-center justify-center gap-1", disabled ? "cursor-default" : "cursor-pointer")}>
      <span className={cn("truncate border-b border-dashed border-current/40 pb-px text-[13px]", TONE[current], disabled && "border-transparent")}>{label}</span>
      {pending && <Loader2 className="size-3 shrink-0 animate-spin text-muted" />}
      {status === "saved" && <Check className="size-3 shrink-0 text-emerald-600" aria-label="Saved" />}
      {status === "error" && <span className="text-xs text-red-600">!</span>}
      <select
        value={current}
        onChange={(e) => change(e.target.value)}
        disabled={disabled || pending}
        aria-label={`${module} ${action}`}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
