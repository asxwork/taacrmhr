"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import type { FormState } from "@/lib/utils";

/** Email and password, then (only for accounts with two-step login) the 6-digit authenticator code. */
export function LoginForm({ action }: { action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const needCode = !!state?.needCode;
  // Kept in state: React resets a form after each submit, and the code step re-sends email and password.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required autoFocus={!needCode} readOnly={needCode} value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
      </Field>
      <Field label="Password">
        <input name="password" type="password" autoComplete="current-password" required readOnly={needCode} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
      </Field>
      {needCode && (
        <Field label="Authenticator code" hint="From Google Authenticator or Microsoft Authenticator on your phone.">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="input text-center font-mono text-lg tracking-[0.4em]" placeholder="123456" />
        </Field>
      )}
      {state?.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {!state?.error && state?.message && <p role="status" className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">{state.message}</p>}
      <SubmitButton className="h-11 w-full" pendingText="Signing in…">{needCode ? "Verify and sign in" : "Sign in"}</SubmitButton>
    </form>
  );
}
