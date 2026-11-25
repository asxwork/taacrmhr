// A page opened before a deploy calls server actions that no longer exist ("Server Action … was not found"):
// reload it once so it gets the new version. Client-safe.
export const isStaleDeploy = (e: { name?: string; message?: string }) =>
  e.name === "UnrecognizedActionError" || /was not found on the server|failed-to-find-server-action|Failed to find Server Action|older or newer deployment/i.test(e.message ?? "");

/** Reloads at most once a minute (a page that keeps failing doesn't loop). Returns true when it reloads. */
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem("ams-reloaded") || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem("ams-reloaded", String(Date.now()));
    sessionStorage.setItem("ams-updated", "1"); // the sign-in page says "AMS was just updated"
  } catch {}
  location.reload();
  return true;
}
