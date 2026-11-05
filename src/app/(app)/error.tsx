"use client";

import { useEffect } from "react";

/** Friendly screen when a page breaks; the error is reported to Settings → System health. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: error.message || error.digest, stack: error.stack, path: location.pathname }) }).catch(() => {});
  }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
      <h1 className="mb-2 text-lg font-semibold">Something went wrong on this page</h1>
      <p className="mb-6 text-sm text-muted">It has been reported to the administrator. Try again — if it keeps happening, tell your admin what you were doing.</p>
      <div className="flex justify-center gap-2">
        <button onClick={reset} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">Try again</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload clears the broken state */}
        <a href="/dashboard" className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-canvas">Go home</a>
      </div>
    </div>
  );
}
