"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  none: "text-muted/60 bg-transparent",
  own: "bg-gold-100 text-gold-700",
  team: "bg-amber-50 text-amber-700",
  branch: "bg-sky-50 text-sky-700",
  all: "bg-navy-900/8 text-navy-900",
};

/** Compact scope picker for the permission matrix; colour shows the access level at a glance. */
export function ScopeSelect({ name, defaultValue, options }: { name: string; defaultValue: string; options: { value: string; label: string }[] }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={cn("h-7 w-full min-w-20 cursor-pointer rounded-md border border-line px-1.5 text-xs font-medium outline-none focus:border-navy-700 disabled:cursor-default", TONE[value])}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.value === "none" ? "—" : o.label}</option>
      ))}
    </select>
  );
}
