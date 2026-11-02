import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
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
  /** Set while a Super Admin is using "View as" (read-only): who is really signed in. */
  viewAs?: { realId: string; realName: string };
};

/** Cookie holding the user a Super Admin is viewing the app as (Settings → Users → View as). */
export const VIEW_AS_COOKIE = "taa_view_as";

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
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const entry = await memo(`session:${tokenHash}`, 30_000, () => loadSessionUser(tokenHash));
  if (!entry || entry.expiresAt < new Date()) return null;
  // View as: a Super Admin sees the app with another user's permissions and data (writes are blocked in middleware).
  const asId = jar.get(VIEW_AS_COOKIE)?.value;
  if (asId && entry.user.isSuperAdmin && asId !== entry.user.id) {
    const target = await memo(`session:viewas:${asId}`, 30_000, () => loadUserById(asId));
    if (target) return { ...target, viewAs: { realId: entry.user.id, realName: entry.user.name } };
  }
  return entry.user;
});

const USER_INCLUDE = { branch: true, roles: { include: { role: { include: { permissions: true } } } } } as const;

async function loadUserById(id: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({ where: { id }, include: USER_INCLUDE });
  return user && user.active ? buildSessionUser(user) : null;
}

async function loadSessionUser(tokenHash: string): Promise<{ user: SessionUser; expiresAt: Date } | null> {
  const session = await db.session.findUnique({ where: { tokenHash }, include: { user: { include: USER_INCLUDE } } });
  if (!session || !session.user.active) return null;
  return { user: await buildSessionUser(session.user), expiresAt: session.expiresAt };
}

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

async function buildSessionUser(user: UserWithRoles): Promise<SessionUser> {
  const perms: PermissionMap = {};
  for (const { role } of user.roles) {
    for (const p of role.permissions) {
      const key = permKey(p.module, p.action as Action);
      perms[key] = maxScope(perms[key] ?? "none", p.scope as Scope);
    }
  }

  // Per-user exceptions replace whatever the roles gave (they can widen or narrow).
  for (const o of await db.userPermission.findMany({ where: { userId: user.id } })) perms[permKey(o.module, o.action as Action)] = o.scope as Scope;

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
  return sessionUser;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
