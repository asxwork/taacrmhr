// Messenger: direct and group conversations between staff. Polled by the page (no live socket needed on shared hosting).
import { db } from "./db";
import { fileUrl } from "./files";

export const CHAT_PAGE = 50;

/** Total unread messages for the sidebar badge. */
export async function chatUnread(userId: string) {
  const mine = await db.chatMember.findMany({ where: { userId }, select: { threadId: true, lastReadAt: true } });
  if (!mine.length) return 0;
  const counts = await Promise.all(mine.map((m) => db.chatMessage.count({ where: { threadId: m.threadId, createdAt: { gt: m.lastReadAt }, userId: { not: userId }, deletedAt: null } })));
  return counts.reduce((s, n) => s + n, 0);
}

export type ThreadRow = { id: string; kind: string; title: string; photo: string | null; members: number; last: string; lastAt: string; unread: number; online?: boolean };

/** My conversations, newest first, with the last message and unread count. */
export async function myThreads(userId: string): Promise<ThreadRow[]> {
  const rows = await db.chatMember.findMany({
    where: { userId },
    include: { thread: { include: { members: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { thread: { lastMessageAt: "desc" } },
    take: 200,
  });
  const otherIds = [...new Set(rows.flatMap((r) => r.thread.members.map((m) => m.userId)).filter((id) => id !== userId))];
  const users = await db.user.findMany({ where: { id: { in: [...otherIds, ...rows.map((r) => r.thread.messages[0]?.userId).filter((x): x is string => !!x)] } }, select: { id: true, name: true, lastLoginAt: true, employee: { select: { photo: true } } } });
  const u = (id: string) => users.find((x) => x.id === id);
  return Promise.all(rows.map(async (r) => {
    const t = r.thread;
    const other = t.kind === "direct" ? u(t.members.find((m) => m.userId !== userId)?.userId ?? "") : undefined;
    const last = t.messages[0];
    const unread = await db.chatMessage.count({ where: { threadId: t.id, createdAt: { gt: r.lastReadAt }, userId: { not: userId }, deletedAt: null } });
    const who = last && last.userId !== userId && t.kind === "group" ? `${u(last.userId)?.name.split(" ")[0] ?? ""}: ` : last?.userId === userId ? "You: " : "";
    return {
      id: t.id, kind: t.kind,
      title: t.kind === "group" ? t.name ?? "Group" : other?.name ?? "Former colleague",
      photo: other?.employee?.photo ? fileUrl(other.employee.photo, 160) : null,
      members: t.members.length,
      last: last ? (last.deletedAt ? "Message deleted" : `${who}${last.body || (last.fileName ? `📎 ${last.fileName}` : "")}`).slice(0, 90) : "No messages yet",
      lastAt: (last?.createdAt ?? t.createdAt).toISOString(),
      unread,
    };
  }));
}

export type MessageRow = { id: string; userId: string; name: string; body: string; file: string | null; fileName: string | null; image: boolean; at: string; edited: boolean; deleted: boolean };

/** Messages of a conversation the user is in (newest page, or those after a time). Marks it read. */
export async function threadMessages(userId: string, threadId: string, after?: Date, before?: Date) {
  const member = await db.chatMember.findFirst({ where: { threadId, userId } });
  if (!member) return null;
  const msgs = await db.chatMessage.findMany({
    where: { threadId, ...(after ? { OR: [{ createdAt: { gt: after } }, { editedAt: { gt: after } }, { deletedAt: { gt: after } }] } : {}), ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" }, take: CHAT_PAGE,
  });
  msgs.reverse();
  const users = await db.user.findMany({ where: { id: { in: [...new Set(msgs.map((m) => m.userId))] } }, select: { id: true, name: true } });
  await db.chatMember.update({ where: { id: member.id }, data: { lastReadAt: new Date() } });
  // Others' read times: "Seen" under my last message.
  const others = await db.chatMember.findMany({ where: { threadId, userId: { not: userId } }, select: { lastReadAt: true } });
  const seenAt = others.length ? new Date(Math.min(...others.map((o) => +o.lastReadAt))).toISOString() : null;
  return {
    seenAt,
    messages: msgs.map((m): MessageRow => ({
      id: m.id, userId: m.userId, name: users.find((u) => u.id === m.userId)?.name ?? "Former colleague",
      body: m.deletedAt ? "" : m.body, file: m.deletedAt || !m.file ? null : fileUrl(m.file), fileName: m.deletedAt ? null : m.fileName,
      image: !!m.file && /\.(jpe?g|png|webp)$/i.test(m.file), at: m.createdAt.toISOString(), edited: !!m.editedAt, deleted: !!m.deletedAt,
    })),
  };
}

/** The two-person conversation, made the first time. */
export async function directThread(a: string, b: string) {
  const pairKey = [a, b].sort().join(":");
  const found = await db.chatThread.findUnique({ where: { pairKey } });
  if (found) return found.id;
  const t = await db.chatThread.create({ data: { kind: "direct", pairKey, createdById: a, members: { create: [{ userId: a }, { userId: b }] } } });
  return t.id;
}
