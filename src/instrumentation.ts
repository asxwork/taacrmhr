// Runs once when the server starts. All dates (attendance days, task due times, payroll months)
// are computed in company local time, so pin the process timezone even if the host runs on UTC.
export function register() {
  process.env.TZ = process.env.APP_TIMEZONE ?? "Asia/Karachi";
}

/** Every unhandled server error (pages, server actions, API routes) goes to the error log. */
export async function onRequestError(err: unknown, request: { path: string }) {
  const e = err as Error & { digest?: string };
  if (e?.digest?.startsWith("NEXT_")) return; // redirects / not-found are not errors
  // The import sits inside this check so the edge bundle never includes the database code.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logError } = await import("./lib/errors");
    await logError({ source: "server", message: e?.message ?? String(err), stack: e?.stack, path: request.path });
  }
}
