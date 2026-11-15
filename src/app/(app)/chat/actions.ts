"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { directThread } from "@/lib/chat";
import { saveUpload } from "@/lib/files";
import { str, type FormState } from "@/lib/utils";

async function chatUser() {
  const user = await requireUser();
  if (!can(user, "chat") || user.viewAs) throw new Error("Not allowed");
  return user;
}

/** Sends a message (text and/or one file: photo or PDF up to 10 MB). */
export async function sendMessage(fd: FormData): Promise<{ ok?: true; error?: string }> {
  const user = await chatUser();
  const threadId = str(fd, "threadId");
  if (!(await db.chatMember.findFirst({ where: { threadId, userId: user.id } }))) return { error: "You're not in this conversation." };
  const body = String(fd.get("body") ?? "").trim().slice(0, 4000);
  const f = fd.get("file");
  let file: string | null = null, fileName: string | null = null;
  if (f instanceof File && f.size > 0) {
    const up = await saveUpload(f, `chat/${threadId}`, { maxBytes: 10_000_000, allowPdf: true });
    if ("error" in up) return { error: up.error };
    file = up.path; fileName = f.name.slice(0, 120);
  }
  if (!body && !file) return { error: "Type a message." };
  const now = new Date();
  await db.chatMessage.create({ data: { threadId, userId: user.id, body, file, fileName, createdAt: now } });
  await db.chatThread.update({ where: { id: threadId }, data: { lastMessageAt: now } });
  await db.chatMember.updateMany({ where: { threadId, userId: user.id }, data: { lastReadAt: now } });
  return { ok: true };
}

export async function startDirect(fd: FormData) {
  const user = await chatUser();
  const other = str(fd, "userId");
  if (!other || other === user.id || !(await db.user.findFirst({ where: { id: other, active: true } }))) redirect("/chat");
  redirect(`/chat?t=${await directThread(user.id, other)}`);
}

export async function createGroup(_: FormState, fd: FormData): Promise<FormState> {
  const user = await chatUser();
  if (!can(user, "chat", "create")) return { error: "Your role can't start group chats." };
  const name = str(fd, "name").slice(0, 60);
  const ids = [...new Set(fd.getAll("members").map(String).filter((id) => id && id !== user.id))];
  if (!name) return { error: "Give the group a name." };
  if (!ids.length) return { error: "Add at least one person." };
  const valid = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  const t = await db.chatThread.create({ data: { kind: "group", name, createdById: user.id, members: { create: [{ userId: user.id, isAdmin: true }, ...valid.map((v) => ({ userId: v.id }))] } } });
  await db.chatMessage.create({ data: { threadId: t.id, userId: user.id, body: `${user.name} created the group “${name}”` } });
  redirect(`/chat?t=${t.id}`);
}

export async function addMembers(_: FormState, fd: FormData): Promise<FormState> {
  const user = await chatUser();
  const threadId = str(fd, "threadId");
  const me = await db.chatMember.findFirst({ where: { threadId, userId: user.id }, include: { thread: true } });
  if (!me || me.thread.kind !== "group") return { error: "Not a group." };
  const ids = fd.getAll("members").map(String).filter(Boolean);
  const valid = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true } });
  for (const v of valid) await db.chatMember.upsert({ where: { threadId_userId: { threadId, userId: v.id } }, update: {}, create: { threadId, userId: v.id } });
  if (valid.length) await db.chatMessage.create({ data: { threadId, userId: user.id, body: `${user.name} added ${valid.map((v) => v.name).join(", ")}` } });
  return { ok: true, message: "Added." };
}

export async function leaveGroup(fd: FormData) {
  const user = await chatUser();
  const threadId = str(fd, "threadId");
  const me = await db.chatMember.findFirst({ where: { threadId, userId: user.id }, include: { thread: true } });
  if (me?.thread.kind === "group") {
    await db.chatMember.delete({ where: { id: me.id } });
    await db.chatMessage.create({ data: { threadId, userId: user.id, body: `${user.name} left the group` } });
  }
  redirect("/chat");
}

/** Your own message: removed for everyone (shows "Message deleted"). */
export async function deleteMessage(id: string) {
  const user = await chatUser();
  const m = await db.chatMessage.findUnique({ where: { id } });
  if (!m || (m.userId !== user.id && !user.isSuperAdmin)) return { error: "You can only delete your own messages." };
  await db.chatMessage.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}
