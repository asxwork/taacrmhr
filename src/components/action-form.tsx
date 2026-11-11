"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/utils";
import { buttonClass } from "./ui";
import { reportSlow } from "./nav-progress";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, className)}>
      {pending ? pendingText : children}
    </button>
  );
}

/** True for the error a page loaded before a redeploy gets when it calls a server action that changed. */
export const isStaleDeployment = (e: unknown) =>
  (e as Error)?.name === "UnrecognizedActionError" || /was not found on the server|failed-to-find-server-action|Failed to find Server Action|older or newer deployment/i.test(String((e as Error)?.message ?? ""));

/** A save that throws shows a message on the form instead of replacing the whole page. */
function saveFailed(err: Error & { digest?: string }): FormState {
  if (isStaleDeployment(err)) {
    setTimeout(() => location.reload(), 1500);
    return { error: "AMS was just updated. Reloading the page… then please save again." };
  }
  void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: err?.message || err?.digest || "Save failed", stack: err?.stack, path: location.pathname }) }).catch(() => {});
  return { error: `Couldn't save this${err?.digest ? ` (ref ${err.digest})` : ""}. It has been reported — try again, and if it keeps happening tell your admin.` };
}

/** Form bound to a server action returning FormState; shows the action's error inline. */
export function ActionForm({
  action,
  children,
  className,
  successMessage,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    const t0 = Date.now();
    try {
      const res = await action(prev, fd);
      const ms = Date.now() - t0;
      if (ms > 4000) reportSlow(`Slow save on ${location.pathname} took ${(ms / 1000).toFixed(1)}s`, location.pathname);
      return res;
    } catch (e) {
      const err = e as Error & { digest?: string };
      if (err?.digest?.startsWith("NEXT_")) throw e; // redirects and not-found are handled by Next
      return saveFailed(err);
    }
  }, undefined);
  const feedback = useRef<HTMLDivElement>(null);
  // Long forms submit from the bottom: bring the message into view so it is never missed.
  useEffect(() => {
    if (state?.error || state?.confirm) feedback.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);
  const okMessage = state?.ok ? state.message ?? successMessage : undefined;
  return (
    <form action={formAction} className={className}>
      {(state?.error || state?.confirm || okMessage) && (
      <div ref={feedback} className="w-full">
      {state?.error && <p role="alert" className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.confirm && (
        <label role="alert" className="mb-4 flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <input type="checkbox" name="confirm" className="mt-0.5 accent-amber-600" />
          <span>{state.confirm}</span>
        </label>
      )}
      {okMessage && <p role="status" className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{okMessage}</p>}
      </div>
      )}
      {children}
    </form>
  );
}
