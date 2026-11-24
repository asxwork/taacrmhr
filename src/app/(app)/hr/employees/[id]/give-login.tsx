"use client";

import { useState } from "react";
import { Copy, KeyRound, Mail, Wand2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createLoginForEmployee } from "../actions";
import { cn } from "@/lib/utils";

/** Employee profile → Give AMS login: email, role, and how they get in (emailed link or temporary password). */
export function GiveLogin({ id, name, email, roles, canMail, successHref }: { id: string; name: string; email: string; roles: { id: string; name: string }[]; canMail: boolean; successHref: string }) {
  const [how, setHow] = useState(canMail ? "link" : "password");
  const [pw, setPw] = useState("");
  const gen = () => {
    const words = "Advisor Tower Garden Silver Royal Bright Ocean Summit".split(" ");
    const a = crypto.getRandomValues(new Uint32Array(2));
    setPw(`${words[a[0]! % words.length]}@${1000 + (a[1]! % 9000)}`);
  };
  const employeeRole = roles.find((r) => r.name === "Employee")?.id;
  return (
    <ActionForm action={createLoginForEmployee} className="space-y-4" successHref={successHref}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="how" value={how} />
      <p className="text-sm text-muted">{name} gets their own AMS sign-in: check in, apply for leave, see payslips, and whatever their role allows.</p>
      <label className="block text-sm font-medium">Login email
        <input name="email" type="email" required defaultValue={email} placeholder="name@theadvisorassociates.com" className="input mt-1" />
        <span className="mt-1 block text-xs font-normal text-muted">They can also sign in with just the part before @, or their name.</span>
      </label>
      <label className="block text-sm font-medium">Role
        <select name="roleId" defaultValue={employeeRole} className="input mt-1">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">How they get in</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["link", Mail, "Email them a link", canMail ? "They choose their own password" : "Email isn't set up yet"], ["password", KeyRound, "Temporary password", "You tell them; they change it at first sign-in"]] as const).map(([k, Icon, t, d]) => (
            <button key={k} type="button" disabled={k === "link" && !canMail} onClick={() => setHow(k)} className={cn("flex items-start gap-2.5 rounded-lg border p-3 text-left transition disabled:opacity-50", how === k ? "border-navy-900 bg-navy-900/[0.04] ring-1 ring-navy-900" : "border-line hover:bg-canvas")}>
              <Icon className="mt-0.5 size-4 shrink-0" /><span><b className="block text-sm">{t}</b><span className="text-xs text-muted">{d}</span></span>
            </button>
          ))}
        </div>
      </fieldset>
      {how === "password" && (
        <div className="flex gap-2">
          <input name="password" type="text" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" className="input font-mono" aria-label="Temporary password" autoComplete="off" />
          <button type="button" onClick={gen} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-canvas"><Wand2 className="size-4" /> Generate</button>
          {pw && <button type="button" onClick={() => navigator.clipboard?.writeText(pw)} className="inline-flex h-10 shrink-0 items-center rounded-lg border border-line px-2.5 hover:bg-canvas" aria-label="Copy password"><Copy className="size-4" /></button>}
        </div>
      )}
      <SubmitButton pendingText="Creating…">Create login</SubmitButton>
    </ActionForm>
  );
}
