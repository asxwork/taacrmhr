"use client";

import { useActionState } from "react";
import { postToFeed } from "@/app/(app)/feed/actions";

/** One-tap wish on someone's birthday or work anniversary (posted to the feed as kudos, they get a notification). */
export function SendWish({ employeeId, text }: { employeeId: string; text: string }) {
  const [state, act, pending] = useActionState(postToFeed, undefined);
  if (state?.ok) return <span className="text-xs text-emerald-700">Sent 🎉</span>;
  return (
    <form action={act}>
      <input type="hidden" name="kind" value="kudos" />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="body" value={text} />
      <button disabled={pending} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-canvas disabled:opacity-50">{pending ? "…" : "Send wishes"}</button>
      {state?.error && <span className="ml-1 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
