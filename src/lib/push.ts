// Web Push: phone / desktop notifications even when AMS isn't open. Keys are made once and kept in Settings
// (the private key sealed with SIP_SECRET_KEY / CRON_SECRET), unless VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set.
import webpush from "web-push";
import { db } from "./db";
import { memo } from "./memo";
import { disabledFeatures } from "./features";
import { canStoreSecrets, openSecret, sealSecret } from "./softphone";

const SETTING = "push.vapid";

export function vapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  return memo("setting:vapid", 300_000, async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    const row = await db.setting.findUnique({ where: { key: SETTING } });
    if (row) {
      try { const v = JSON.parse(row.value) as { publicKey: string; sealed: string }; const privateKey = openSecret(v.sealed); if (privateKey) return { publicKey: v.publicKey, privateKey }; } catch {}
    }
    if (!canStoreSecrets()) return null;
    const k = webpush.generateVAPIDKeys();
    await db.setting.upsert({ where: { key: SETTING }, update: { value: JSON.stringify({ publicKey: k.publicKey, sealed: sealSecret(k.privateKey) }) }, create: { key: SETTING, value: JSON.stringify({ publicKey: k.publicKey, sealed: sealSecret(k.privateKey) }) } });
    return k;
  });
}

/** Sends a push to every device the user turned notifications on for. Dead subscriptions are removed. */
export async function sendPush(userId: string, title: string, body?: string | null, link?: string | null) {
  if ((await disabledFeatures()).has("push")) return;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return;
  const keys = await vapidKeys();
  if (!keys) return;
  const payload = JSON.stringify({ title, body: body ?? "", link: link ?? "/notifications" });
  const subject = process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "mailto:admin@example.com";
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 3600 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
    }
  }));
}
