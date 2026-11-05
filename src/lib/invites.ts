import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { sendMail } from "./mail";

const VALID_HOURS = 72;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** New one-time set-password token (only its hash is stored); any earlier link for this user stops working. */
export async function createPasswordToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.passwordToken.deleteMany({ where: { userId } });
  await db.passwordToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VALID_HOURS * 36e5) } });
  return token;
}

/** The user a set-password token belongs to, if it is still valid. */
export async function findPasswordToken(token: string) {
  if (!token) return null;
  const row = await db.passwordToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, name: true, email: true, active: true } } } });
  return row && row.expiresAt > new Date() && row.user.active ? row : null;
}

/** Welcome email with a link to set their own password. The password itself is never emailed. */
export async function sendLoginEmail(user: { id: string; name: string; email: string }, actorId: string) {
  const token = await createPasswordToken(user.id);
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value ?? "The Advisor Associates";
  const first = user.name.split(" ")[0];
  const intro = `Hi ${first},\n\nYour account at ${company} is ready.\n\nSign-in email: ${user.email}`;
  const outro = `The link works once and expires in ${VALID_HOURS / 24} days. If it has expired, ask your administrator to send a new one.\n\nAfter that, sign in at ${base}/login`;
  return sendMail(
    user.email,
    `Set up your account at ${company}`,
    `${intro}\n\nSet your password here:\n${base}/set-password?token=${token}\n\n${outro}`,
    // The log must not hold a working link.
    { userId: actorId, logBody: `${intro}\n\n[set-password link hidden]\n\n${outro}` },
  );
}
