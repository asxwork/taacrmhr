import { timingSafeEqual } from "node:crypto";
import { runBitrixSync, syncConfig } from "@/lib/bitrix-sync";
import { disabledFeatures } from "@/lib/features";

// Optional Hostinger cron (e.g. every 15 minutes): GET https://<domain>/api/cron/bitrix?key=<CRON_SECRET>
// Syncs new and changed Bitrix leads. It also runs on its own while people use AMS.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!secret || secret === "change-me" || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }
  const [c, off] = await Promise.all([syncConfig(), disabledFeatures()]);
  if (!c.enabled || !c.sealed || off.has("crm-bitrix-sync") || off.has("app-crm")) return Response.json({ ok: true, message: "Bitrix sync is off." });
  return Response.json(await runBitrixSync());
}
