"use client";

import { useState } from "react";
import { ACTIVITY_TYPES } from "@/lib/crm-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addActivity, sendEntityEmail } from "@/app/(app)/crm/activity-actions";
import { cn } from "@/lib/utils";

/** Bitrix-style activity composer: pick a type, write, optionally schedule. */
export function Composer({
  entity,
  path,
  users,
  currentUserId,
  types,
  emailTo,
}: {
  entity: Record<string, string>;
  path: string;
  users?: { id: string; name: string }[];
  currentUserId: string;
  /** Restrict the tabs, e.g. personal tasks can only be task/meeting/visit. */
  types?: string[];
  /** When set, adds an Email tab that sends to this address. */
  emailTo?: string | null;
}) {
  const base = types ? ACTIVITY_TYPES.filter((t) => types.includes(t.value)) : ACTIVITY_TYPES;
  const tabs: { value: string; label: string }[] = emailTo ? [...base, { value: "email", label: "Email" }] : [...base];
  const [type, setType] = useState<string>(tabs[0]!.value);
  const schedulable = type === "task" || type === "meeting" || type === "visit";

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex gap-1 border-b border-line px-2 pt-2">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn("rounded-t-md px-3 py-1.5 text-sm", type === t.value ? "border-b-2 border-navy-900 font-medium text-ink" : "text-muted hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {type === "email" && emailTo ? (
        <ActionForm action={sendEntityEmail} className="space-y-3 p-3">
          {Object.entries(entity).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="path" value={path} />
          <p className="text-xs text-muted">To: <span className="text-ink">{emailTo}</span></p>
          <input name="subject" required placeholder="Subject" className="input" />
          <textarea name="body" required rows={5} placeholder="Write your email…" className="input resize-y" />
          <div className="flex justify-end">
            <SubmitButton pendingText="Sending…">Send email</SubmitButton>
          </div>
        </ActionForm>
      ) : (
      <ActionForm action={addActivity} className="space-y-3 p-3">
        {Object.entries(entity).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="path" value={path} />
        {type !== "note" && <input name="subject" placeholder={type === "call" ? "Call summary, e.g. Discussed payment plan" : "Title"} className="input" />}
        <textarea
          name="body"
          rows={type === "note" ? 3 : 2}
          placeholder={type === "note" ? "Write a note…" : "Details (optional)"}
          className="input resize-y"
          required={type === "note"}
        />
        <div className="flex flex-wrap items-center gap-2">
          {schedulable && (
            <>
              <input name="dueAt" type="datetime-local" required={type === "task"} className="input w-auto" aria-label="When" />
              {users && users.length > 1 && (
                <select name="ownerId" defaultValue={currentUserId} className="input w-auto" aria-label="Assign to">
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
            </>
          )}
          <SubmitButton className="ml-auto">{schedulable ? "Schedule" : "Save"}</SubmitButton>
        </div>
        {schedulable && type !== "task" && <p className="text-xs text-muted">Leave the date empty to log one that already happened.</p>}
      </ActionForm>
      )}
    </div>
  );
}
