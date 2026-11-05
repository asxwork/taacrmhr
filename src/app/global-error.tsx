"use client";

import { useEffect } from "react";

/** Last-resort screen if the whole app shell fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: error.message || error.digest, stack: error.stack, path: location.pathname }) }).catch(() => {});
  }, [error]);
  return (
    <html lang="en"><body style={{ fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f6f7f9" }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
        <p style={{ color: "#6b7280", fontSize: 14 }}>It has been reported. Please try again.</p>
        <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, background: "#0a223c", color: "#fff", border: 0 }}>Try again</button>
      </div>
    </body></html>
  );
}
