"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { FormState } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; kind: "csr" | "sales"; canLog: boolean; roles: string };

/** Make batches: everyone with dialer access, filtered by CSR / Sales / All and a search; tick, set batches, give. */
export function BatchMaker({ campaignId, unassigned, people, kind, action }: { campaignId: string; unassigned: number; people: Person[]; kind: "csr" | "sales"; action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const [tab, setTab] = useState<"all" | "csr" | "sales">(kind);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => people.filter((p) => (tab === "all" || p.kind === tab) && (!needle || p.name.toLowerCase().includes(needle))), [people, tab, needle]);
  const count = (k: "all" | "csr" | "sales") => people.filter((p) => k === "all" || p.kind === k).length;
  const toggle = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <p className="text-xs text-muted"><b className="text-ink">{unassigned.toLocaleString()}</b> unassigned number{unassigned === 1 ? "" : "s"}. Tick people and set how many batches each gets.</p>
      <label className="flex items-center gap-2 text-sm">Numbers per batch
        <input name="size" type="number" min={1} max={5000} defaultValue={Math.min(50, Math.max(1, unassigned)) || 50} className="input h-9 w-24" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs font-medium">
          {([["all", "All"], ["csr", "CSR agents"], ["sales", "Sales agents"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-md px-2.5 py-1.5 transition", tab === k ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>{l} <span className="opacity-70">{count(k)}</span></button>
          ))}
        </div>
        <label className="relative min-w-36 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" className="input h-8 pl-8 text-sm" aria-label="Find a person" />
        </label>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-canvas px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <input type="checkbox" aria-label="Tick everyone shown" className="accent-navy-900" checked={shown.length > 0 && shown.every((p) => picked.has(p.id))} onChange={(e) => setPicked((s) => { const n = new Set(s); for (const p of shown) { if (e.target.checked) n.add(p.id); else n.delete(p.id); } return n; })} />
          <span className="flex-1">Person</span><span>Batches</span>
        </div>
        {shown.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">{people.length ? "Nobody here." : "Nobody has dialer access yet: give a role (or a person in Access exceptions) Calls → Read and Edit."}</p> : shown.map((p) => (
          <label key={p.id} className={cn("flex items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-0", picked.has(p.id) && "bg-navy-900/[0.04]")}>
            <input type="checkbox" checked={picked.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} className="accent-navy-900" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5"><span className="truncate font-medium">{p.name}</span><span className={cn("rounded px-1.5 text-[10px] font-semibold", p.kind === "csr" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>{p.kind === "csr" ? "CSR" : "Sales"}</span></span>
              {!p.canLog ? <span className="flex items-center gap-1 text-[11px] text-red-600"><AlertTriangle className="size-3" /> Can&apos;t save calls: give Calls → Edit</span> : p.roles ? <span className="block truncate text-[11px] text-muted">{p.roles}</span> : null}
            </span>
            <input type="number" name={`count_${p.id}`} min={0} max={100} defaultValue={1} className="input h-8 w-16 text-center" aria-label={`Batches for ${p.name}`} />
          </label>
        ))}
      </div>
      {/* Ticked people (also those hidden by the filter) are sent. */}
      {[...picked].map((id) => <input key={id} type="hidden" name="agents" value={id} />)}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText="Assigning…">Give batches{picked.size ? ` to ${picked.size}` : ""}</SubmitButton>
        <button type="submit" name="mode" value="all" className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm hover:bg-canvas">Split all equally</button>
      </div>
    </ActionForm>
  );
}
