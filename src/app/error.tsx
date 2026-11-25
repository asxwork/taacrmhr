"use client";

import { useEffect } from "react";
import { isStaleDeploy, reloadForNewVersion } from "@/lib/stale-deploy";

/** Pages outside the app (sign in, set password, verify email…): a page from before a deploy reloads itself. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (isStaleDeploy(error) && reloadForNewVersion()) return;
    void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: error.message || error.digest, stack: error.stack, path: location.pathname }) }).catch(() => {});
  }, [error]);
  if (isStaleDeploy(error)) return <p className="mt-24 text-center text-sm text-muted">AMS was just updated. Loading the new version…</p>;
  return (
    <div className="mx-auto mt-24 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
      <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
      <p className="mb-6 text-sm text-muted">It has been reported. Please try again.</p>
      <div className="flex justify-center gap-2">
        <button onClick={reset} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">Try again</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload clears the broken state */}
        <a href="/login" className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-canvas">Sign-in page</a>
      </div>
    </div>
  );
}
