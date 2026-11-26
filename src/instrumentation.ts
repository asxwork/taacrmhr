// Runs once when the server starts. All dates (attendance days, task due times, payroll months)
// are computed in company local time, so pin the process timezone even if the host runs on UTC.
export async function register() {
  process.env.TZ = process.env.APP_TIMEZONE ?? "Asia/Karachi";
  // Count server starts (System health shows restarts in the last 24 hours).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordStart } = await import("./lib/app-starts");
    void recordStart();
    // Uploads now live outside the app folder (deploys rebuild it): move over whatever is still in the old one.
    // 2nd rounds now stay inside their campaign: fold older separate "… — 2nd round" campaigns back in.
    void import("./lib/calls").then((m) => m.mergeSecondRoundCampaigns()).then((n) => { if (n) console.log(`Merged ${n} 2nd-round campaign(s) into their original campaign`); }).catch((e) => console.error("2nd-round merge failed:", e));
    void import("./lib/upload-safety").then((m) => m.moveOldUploads()).then((n) => { if (n) console.log(`Moved ${n} upload(s) to the permanent folder`); }).catch((e) => console.error("Upload move failed:", e));
  }
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
