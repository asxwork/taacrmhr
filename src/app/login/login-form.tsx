"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { SubmitButton } from "@/components/action-form";
import type { FormState } from "@/lib/utils";

const REMEMBER = "ams.login.email";
const store = { get: () => { try { return localStorage.getItem(REMEMBER) ?? ""; } catch { return ""; } }, set: (v: string) => { try { if (v) localStorage.setItem(REMEMBER, v); else localStorage.removeItem(REMEMBER); } catch {} } };

/** Email and password (show/hide, Caps Lock warning, remember email), then the 6-digit code for two-step accounts. */
export function LoginForm({ action, resetAction }: { action: (s: FormState, fd: FormData) => Promise<FormState>; resetAction: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const [resetState, resetFormAction] = useActionState(resetAction, undefined);
  const needCode = !!state?.needCode;
  // Kept in state: React resets a form after each submit, and the code step re-sends email and password.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [remember, setRemember] = useState(true);
  const [forgot, setForgot] = useState(false);
  useEffect(() => { const e = store.get(); if (e) setEmail(e); }, []);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);

  if (forgot) return (
    <form action={resetFormAction} className="space-y-4">
      <p className="text-sm text-muted">Enter your work email and we&apos;ll send you a link to choose a new password.</p>
      <label className="relative block">
        <span className="sr-only">Email</span>
        <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input name="email" type="email" required defaultValue={email} placeholder="you@theadvisorassociates.com" className="input h-12 pl-10" />
      </label>
      {resetState?.message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resetState.message}</p>}
      {resetState?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{resetState.error}</p>}
      <SubmitButton className="h-12 w-full" pendingText="Sending…"><KeyRound className="size-4" /> Send reset link</SubmitButton>
      <button type="button" onClick={() => setForgot(false)} className="w-full text-center text-sm text-muted hover:text-ink">← Back to sign in</button>
    </form>
  );

  return (
    <form action={(fd) => { store.set(remember ? email.trim() : ""); formAction(fd); }} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Email</span>
        <span className="relative block">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="email" type="email" autoComplete="username" required autoFocus={!needCode && !email} readOnly={needCode} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@theadvisorassociates.com" className="input h-12 pl-10" />
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-sm font-medium">Password
          <button type="button" onClick={() => setForgot(true)} className="text-xs font-normal text-navy-900 hover:underline dark:text-gold-300">Forgot password?</button>
        </span>
        <span className="relative block">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required autoFocus={!needCode && !!email} readOnly={needCode} value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey} onKeyUp={onKey} placeholder="••••••••" className="input h-12 pl-10 pr-12" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink">
            {show ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        </span>
        {caps && <span className="mt-1.5 block text-xs font-medium text-amber-700">Caps Lock is on</span>}
      </label>
      {needCode && (
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="size-4 text-emerald-600" /> Authenticator code</span>
          <input name="code" autoComplete="one-time-code" pattern="[0-9 ]{6,7}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}" maxLength={9} required autoFocus autoCapitalize="characters" className="input h-12 text-center font-mono text-xl tracking-[0.4em]" placeholder="123456" />
          <span className="mt-1 block text-xs text-muted">From Google Authenticator or Microsoft Authenticator on your phone. Lost your phone? Type one of your backup codes (like 7KQ2-M9XD).</span>
        </label>
      )}
      {!needCode && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-navy-900" /> Remember my email on this device
        </label>
      )}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {!state?.error && state?.message && <p role="status" className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{state.message}</p>}
      <SubmitButton className="group h-12 w-full text-base" pendingText="Signing in…">{needCode ? "Verify and sign in" : "Sign in"} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></SubmitButton>
    </form>
  );
}
