import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/files";
import { myThreads, threadMessages } from "@/lib/chat";
import { ChatApp } from "./chat-app";

export const metadata = { title: "Messenger" };

/** Messenger: chat one-to-one or in groups with colleagues. */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const user = await requireUser();
  if (!can(user, "chat")) redirect("/no-access");
  const sp = await searchParams;
  const [threads, people] = await Promise.all([
    myThreads(user.id),
    db.user.findMany({ where: { active: true, id: { not: user.id } }, select: { id: true, name: true, title: true, lastLoginAt: true, roles: { select: { role: { select: { name: true } } } }, employee: { select: { photo: true } } }, orderBy: { name: "asc" } }),
  ]);
  let active: { id: string; kind: string; title: string; members: { id: string; name: string }[]; canManage: boolean } | null = null;
  let initial: Awaited<ReturnType<typeof threadMessages>> = null;
  if (sp.t) {
    const t = await db.chatThread.findFirst({ where: { id: sp.t, members: { some: { userId: user.id } } }, include: { members: true } });
    if (t) {
      const names = await db.user.findMany({ where: { id: { in: t.members.map((m) => m.userId) } }, select: { id: true, name: true } });
      const row = threads.find((x) => x.id === t.id);
      active = { id: t.id, kind: t.kind, title: row?.title ?? t.name ?? "Chat", members: names, canManage: t.kind === "group" };
      initial = await threadMessages(user.id, t.id);
    }
  }
  return (
    <ChatApp
      me={{ id: user.id, name: user.name, canGroup: can(user, "chat", "create") }}
      threads={threads.map((t) => (t.id === active?.id ? { ...t, unread: 0 } : t))}
      people={people.map((p) => ({ id: p.id, name: p.name, sub: p.title || p.roles.map((r) => r.role.name).join(", ") || "", photo: p.employee?.photo ? fileUrl(p.employee.photo, 160) : null }))}
      active={active}
      initial={initial}
    />
  );
}
