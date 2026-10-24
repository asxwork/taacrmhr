"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/utils";
import { buttonClass } from "./ui";

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
  const [state, formAction] = useActionState(action, undefined);
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
