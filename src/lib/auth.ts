import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { memo } from "./memo";
import { maxScope, permKey, type Action, type PermissionMap, type Scope } from "./rbac";

export const SESSION_COOKIE = "tad_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  branchId: string | null;
  branchName: string | null;
  isSuperAdmin: boolean;
  /** Holds the one-person Boss role (role key "boss"): sees the Boss dashboard. */
  isBoss: boolean;
  roleNames: string[];
  perms: PermissionMap;
  /** Personal appearance overrides (null = company default). */
  prefs: { theme: string | null; accent: string | null; wallpaper: string | null };
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 190) ?? null;
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt, userAgent } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/**
 * Current user with merged permissions from all roles (most permissive scope wins). Cached per request,
 * and across requests for a few seconds: any write to users, roles, permissions or sessions clears it (db.ts).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const entry = await memo(`session:${tokenHash}`, 30_000, () => loadSessionUser(tokenHash));
  if (!entry || entry.expiresAt < new Date()) return null;
  return entry.user;
});

async function loadSessionUser(tokenHash: string): Promise<{ user: SessionUser; expiresAt: Date } | null> {
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { branch: true, roles: { include: { role: { include: { permissions: true } } } } },
      },
    },
  });
  if (!session || !session.user.active) return null;

  const { user } = session;
  const perms: PermissionMap = {};
  for (const { role } of user.roles) {
    for (const p of role.permissions) {
      const key = permKey(p.module, p.action as Action);
      perms[key] = maxScope(perms[key] ?? "none", p.scope as Scope);
    }
  }

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    isSuperAdmin: user.isSuperAdmin,
    isBoss: user.roles.some((r) => r.role.key === "boss"),
    roleNames: user.isSuperAdmin ? ["Super Admin"] : user.roles.map((r) => r.role.name),
    perms,
    prefs: { theme: user.theme, accent: user.accent, wallpaper: user.wallpaper },
  };
  return { user: sessionUser, expiresAt: session.expiresAt };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
