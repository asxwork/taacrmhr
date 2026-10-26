"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SubmitButton } from "@/components/action-form";

type Opt = { id: string; name: string };
export type AutomationOption = { id: string; name: string; steps: string[]; assign: string; userIds: string[]; deletes: boolean };

/** "With selected" bar under the lead list. Fields change with the chosen action; posts into the surrounding form. */
export function LeadBulkBar({ assignees, stages, automations, canAssign, canDelete, isSuperAdmin }: {
  assignees: Opt[]; stages: Opt[]; automations: AutomationOption[]; canAssign: boolean; canDelete: boolean; isSuperAdmin: boolean;
}) {
  const [op, setOp] = useState("");
  const [autoId, setAutoId] = useState(automations[0]?.id ?? "");
  const auto = automations.find((a) => a.id === autoId);
  const blocked = auto?.deletes && !isSuperAdmin;

  return (
    <div className="space-y-2 border-t border-line bg-canvas/40 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">With selected:</span>
        <select name="op" className="input h-8 w-44 text-xs" value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="" disabled>Choose action</option>
          {canAssign && <option value="assign">Assign to…</option>}
          <option value="status">Change stage…</option>
          {automations.length > 0 && <option value="automation">Run automation…</option>}
          {canDelete && <option value="delete">Delete</option>}
        </select>
        {op === "assign" && (
          <select name="ownerId" className="input h-8 w-44 text-xs" defaultValue="">
            <option value="">— person —</option>
            {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        {op === "status" && (
          <select name="statusId" className="input h-8 w-44 text-xs" defaultValue="">
            <option value="">— stage —</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {op === "automation" && (
          <select name="automationId" className="input h-8 w-64 text-xs" value={autoId} onChange={(e) => setAutoId(e.target.value)}>
            {automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {op && op !== "automation" && <SubmitButton variant={op === "delete" ? "danger" : "secondary"} className="h-8 text-xs">{op === "delete" ? "Delete selected" : "Update selected"}</SubmitButton>}
      </div>

      {op === "automation" && auto && (
        <div className="rounded-lg border border-line bg-surface p-3 text-sm">
          <p className="font-medium">{auto.name} will, for each selected lead:</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{auto.steps.map((s) => <li key={s}>{s}</li>)}</ul>
          {auto.assign !== "keep" && (
            <fieldset className="mt-3">
              <legend className="mb-1.5 text-xs font-medium">{auto.assign === "one" ? "Give them to" : "Share them between"}</legend>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {assignees.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type={auto.assign === "one" ? "radio" : "checkbox"} name="agentIds" value={u.id} defaultChecked={auto.userIds.includes(u.id)} className="accent-navy-900" /> {u.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {blocked ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="size-4" /> This automation deletes activities, so only a Super Admin can run it.</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirmRun" className="accent-navy-900" />
                {auto.deletes ? "I understand the deleted activities can't be brought back" : "Run it on the selected leads"}
              </label>
              <SubmitButton variant={auto.deletes ? "danger" : "primary"} className="h-8 text-xs" pendingText="Running…">Run automation</SubmitButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
