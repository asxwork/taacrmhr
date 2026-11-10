import { redirectTo } from "@/lib/redirect";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { exchangeCode } from "@/lib/backup";
import { audit } from "@/lib/audit";

/** Google sends the Super Admin back here after they allow access. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin || user.viewAs) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const state = (await cookies()).get("taa_gstate")?.value;
  const back = (q: string) => redirectTo(`/settings/backup?${q}`);
  if (url.searchParams.get("error")) return back(`err=${encodeURIComponent(url.searchParams.get("error")!)}`);
  if (!state || state !== url.searchParams.get("state")) return back("err=The+sign-in+link+expired.+Try+again.");
  try {
    await exchangeCode(url.searchParams.get("code") ?? "");
    await audit(user.id, "update", "backup", null, "Connected Google Drive for backups");
    return back("ok=connected");
  } catch (e) {
    return back(`err=${encodeURIComponent((e as Error).message)}`);
  }
}
