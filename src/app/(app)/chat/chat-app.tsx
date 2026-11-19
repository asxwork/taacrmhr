"use client";

import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, FileText, LogOut, MessagesSquare, Paperclip, Plus, Search, SendHorizontal, Trash2, UserPlus, Users, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar } from "@/components/ui";
import { SafeImg } from "@/components/safe-img";
import { cn } from "@/lib/utils";
import type { MessageRow, ThreadRow } from "@/lib/chat";
import { addMembers, createGroup, deleteMessage, leaveGroup, sendMessage, startDirect } from "./actions";

type Person = { id: string; name: string; sub: string; photo: string | null };
type Active = { id: string; kind: string; title: string; members: { id: string; name: string }[]; canManage: boolean } | null;

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(iso), today = new Date(), y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const ago = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? time(iso) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Links in a message: web addresses and AMS pages (/crm/leads/…) become clickable. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|\/(?:crm|hr|finance|inventory|calls|me|invoices)\/[^\s]*)/g);
  return <>{parts.map((p, i) => (i % 2 ? <a key={i} href={p} target={p.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="break-all underline underline-offset-2">{p}</a> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export function ChatApp({ me, threads: initialThreads, people, active, initial }: { me: { id: string; name: string; canGroup: boolean; canFiles: boolean }; threads: ThreadRow[]; people: Person[]; active: Active; initial: { messages: MessageRow[]; seenAt: string | null } | null }) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState<MessageRow[]>(initial?.messages ?? []);
  const [seenAt, setSeenAt] = useState(initial?.seenAt ?? null);
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<null | "new" | "group" | "add">(null);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [older, setOlder] = useState((initial?.messages.length ?? 0) >= 50);
  const listEnd = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastAt = useRef<string | null>(null);
  const tick = useRef(0);

  useEffect(() => { setThreads(initialThreads); }, [initialThreads]);
  useEffect(() => { setMessages(initial?.messages ?? []); setSeenAt(initial?.seenAt ?? null); setOlder((initial?.messages.length ?? 0) >= 50); setDraft(""); setFile(null); setError(null); }, [active?.id, initial]);
  useEffect(() => { lastAt.current = new Date().toISOString(); }, [active?.id]);
  useEffect(() => { listEnd.current?.scrollIntoView({ block: "end" }); }, [messages.length, active?.id]);

  // New messages every 3 s while the page is visible; the conversation list every 9 s.
  const poll = useCallback(async () => {
    if (document.hidden) return;
    const withList = tick.current++ % 3 === 0 || !active;
    const since = lastAt.current;
    lastAt.current = new Date().toISOString();
    const qs = new URLSearchParams({ list: withList ? "1" : "0", ...(active ? { thread: active.id } : {}), ...(active && since ? { after: since } : {}) });
    try {
      const r = await fetch(`/api/chat?${qs}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json() as { threads: ThreadRow[] | null; messages?: MessageRow[]; seenAt?: string | null };
      if (j.threads) setThreads(j.threads.map((t) => (t.id === active?.id ? { ...t, unread: 0 } : t)));
      if (j.messages?.length) setMessages((cur) => { const map = new Map(cur.map((m) => [m.id, m])); for (const m of j.messages!) map.set(m.id, m); return [...map.values()].sort((a, b) => a.at.localeCompare(b.at)); });
      if (j.seenAt !== undefined) setSeenAt(j.seenAt);
    } catch { /* offline: try again next time */ }
  }, [active]);
  useEffect(() => { const t = setInterval(poll, 3000); const v = () => !document.hidden && poll(); document.addEventListener("visibilitychange", v); return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); }; }, [poll]);

  async function send() {
    if (!active || sending || (!draft.trim() && !file)) return;
    setSending(true); setError(null);
    const fd = new FormData();
    fd.set("threadId", active.id); fd.set("body", draft);
    if (file) fd.set("file", file);
    const res = await sendMessage(fd);
    setSending(false);
    if (res.error) { setError(res.error); return; }
    setDraft(""); setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    await poll();
  }

  async function loadOlder() {
    if (!active || !messages.length) return;
    const h = scroller.current?.scrollHeight ?? 0;
    const r = await fetch(`/api/chat?list=0&thread=${active.id}&before=${encodeURIComponent(messages[0]!.at)}`, { cache: "no-store" });
    const j = await r.json() as { messages: MessageRow[] };
    setOlder(j.messages.length >= 50);
    setMessages((cur) => [...j.messages, ...cur]);
    requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight - h; });
  }

  const shownThreads = threads.filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));
  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.userId === me.id && !m.deleted), [messages, me.id]);
  const other = (name: string) => people.find((p) => p.name === name);

  const list = (
    <div className={cn("flex min-h-0 flex-col border-line md:w-80 md:shrink-0 md:border-r", active ? "hidden md:flex" : "flex flex-1")}>
      <div className="flex items-center gap-2 border-b border-line p-3">
        <h1 className="flex-1 font-display text-xl font-semibold">Messages</h1>
        <button type="button" onClick={() => setPanel(panel === "new" ? null : "new")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> New</button>
      </div>
      <div className="relative border-b border-line p-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="input h-9 pl-9" aria-label="Search chats" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shownThreads.length === 0 && <li className="px-6 py-12 text-center text-sm text-muted">{threads.length ? "No chat matches." : "No chats yet. Press New to message a colleague."}</li>}
        {shownThreads.map((t) => (
          <li key={t.id}>
            <Link href={`/chat?t=${t.id}`} scroll={false} className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-canvas", t.id === active?.id && "bg-navy-900/[0.06]")}>
              {t.kind === "group" ? <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Users className="size-5" /></span>
                : t.photo ? <SafeImg src={t.photo} alt="" className="size-10 shrink-0 rounded-full object-cover" /> : <Avatar name={t.title} className="size-10 shrink-0 text-xs" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2"><span className={cn("min-w-0 flex-1 truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{t.title}</span><span className="shrink-0 text-[11px] text-muted" suppressHydrationWarning>{ago(t.lastAt)}</span></span>
                <span className="flex items-center gap-2"><span className={cn("min-w-0 flex-1 truncate text-xs", t.unread ? "text-ink" : "text-muted")}>{t.last}</span>{t.unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">{t.unread}</span>}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  const picker = (mode: "new" | "group" | "add") => {
    const existing = new Set(active?.members.map((m) => m.id));
    const choices = people.filter((p) => mode !== "add" || !existing.has(p.id));
    const rows = (input: boolean) => (
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {choices.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).map((p) => (
          <li key={p.id}>
            {input ? (
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-canvas"><input type="checkbox" name="members" value={p.id} className="size-4 accent-navy-900" />{p.photo ? <SafeImg src={p.photo} alt="" className="size-8 rounded-full object-cover" /> : <Avatar name={p.name} className="size-8 text-[10px]" />}<span className="min-w-0"><span className="block truncate text-sm">{p.name}</span><span className="block truncate text-xs text-muted">{p.sub}</span></span></label>
            ) : (
              <form action={startDirect}><input type="hidden" name="userId" value={p.id} /><button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas">{p.photo ? <SafeImg src={p.photo} alt="" className="size-8 rounded-full object-cover" /> : <Avatar name={p.name} className="size-8 text-[10px]" />}<span className="min-w-0"><span className="block truncate text-sm">{p.name}</span><span className="block truncate text-xs text-muted">{p.sub}</span></span></button></form>
            )}
          </li>
        ))}
      </ul>
    );
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 font-medium">{mode === "new" ? "New chat" : mode === "group" ? "New group" : `Add people to ${active?.title}`}</h2>
          <button type="button" onClick={() => setPanel(null)} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Close"><X className="size-4" /></button>
        </div>
        {mode === "new" && me.canGroup && <button type="button" onClick={() => setPanel("group")} className="mb-3 flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-2.5 text-sm font-medium text-navy-900 hover:bg-canvas"><Users className="size-4" /> New group chat</button>}
        <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="input h-9 pl-9" autoFocus /></div>
        {mode === "new" ? rows(false) : (
          <ActionForm action={mode === "group" ? createGroup : addMembers} onSuccess={() => { setPanel(null); router.refresh(); }} className="space-y-3">
            {mode === "group" ? <input name="name" required maxLength={60} placeholder="Group name, e.g. Skyline sales team" className="input" /> : <input type="hidden" name="threadId" value={active?.id} />}
            {rows(true)}
            <SubmitButton>{mode === "group" ? "Create group" : "Add"}</SubmitButton>
          </ActionForm>
        )}
      </div>
    );
  };

  const conversation = active ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <Link href="/chat" className="rounded-md p-1.5 text-muted hover:bg-canvas md:hidden" aria-label="Back to chats"><ArrowLeft className="size-5" /></Link>
        {active.kind === "group" ? <span className="flex size-9 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Users className="size-4" /></span>
          : other(active.title)?.photo ? <SafeImg src={other(active.title)!.photo!} alt="" className="size-9 rounded-full object-cover" /> : <Avatar name={active.title} className="size-9 text-[11px]" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{active.title}</p>
          <p className="truncate text-xs text-muted">{active.kind === "group" ? active.members.map((m) => (m.id === me.id ? "You" : m.name.split(" ")[0])).join(", ") : other(active.title)?.sub}</p>
        </div>
        {active.kind === "group" && <>
          <button type="button" onClick={() => setPanel("add")} className="rounded-md p-2 text-muted hover:bg-canvas hover:text-ink" title="Add people" aria-label="Add people"><UserPlus className="size-4" /></button>
          <form action={leaveGroup}><input type="hidden" name="threadId" value={active.id} /><button className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600" title="Leave group" aria-label="Leave group" onClick={(e) => { if (!confirm("Leave this group?")) e.preventDefault(); }}><LogOut className="size-4" /></button></form>
        </>}
      </div>
      {panel === "add" ? picker("add") : <>
        <div ref={scroller} className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-canvas/40 px-3 py-4 sm:px-6">
          {older && <div className="mb-2 text-center"><button type="button" onClick={loadOlder} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted hover:text-ink">Load older messages</button></div>}
          {messages.length === 0 && <p className="py-16 text-center text-sm text-muted">Say hello 👋</p>}
          {messages.map((m, i) => {
            const mine = m.userId === me.id, prev = messages[i - 1];
            const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
            const grouped = !newDay && prev?.userId === m.userId && +new Date(m.at) - +new Date(prev.at) < 5 * 60_000;
            const system = !m.file && / (created the group|added |left the group)/.test(m.body) && active.kind === "group" && !grouped && m.body.startsWith(m.name);
            return (
              <Fragment key={m.id}>
                {newDay && <div className="py-2 text-center"><span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-muted shadow-xs" suppressHydrationWarning>{dayLabel(m.at)}</span></div>}
                {system ? <p className="py-1 text-center text-xs text-muted">{m.body}</p> : (
                  <div className={cn("group flex", mine ? "justify-end" : "justify-start", !grouped && "pt-2")}>
                    <div className={cn("relative max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-xs sm:max-w-[70%]", mine ? "rounded-br-md bg-navy-900 text-white" : "rounded-bl-md bg-surface text-ink", m.deleted && "italic opacity-70")}>
                      {!mine && active.kind === "group" && !grouped && <p className="mb-0.5 text-xs font-semibold text-violet-700">{m.name}</p>}
                      {m.deleted ? "Message deleted" : <>
                        {m.file && (m.image
                          ? <a href={m.file} target="_blank" rel="noopener noreferrer" className="mb-1 block"><SafeImg src={m.file} alt={m.fileName ?? ""} className="max-h-72 rounded-lg object-cover" /></a>
                          : <a href={m.file} target="_blank" rel="noopener noreferrer" className={cn("mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2", mine ? "bg-white/10" : "bg-canvas")}><FileText className="size-5 shrink-0" /><span className="min-w-0 truncate underline-offset-2 hover:underline">{m.fileName ?? "File"}</span></a>)}
                        {m.body && <p className="whitespace-pre-wrap break-words"><Linked text={m.body} /></p>}
                      </>}
                      <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/60" : "text-muted")} suppressHydrationWarning>
                        {m.edited && "edited · "}{time(m.at)}
                        {mine && !m.deleted && m.id === lastMine?.id && (seenAt && seenAt >= m.at ? <CheckCheck className="size-3.5 text-emerald-300" aria-label="Seen" /> : <Check className="size-3.5" aria-label="Sent" />)}
                      </p>
                      {mine && !m.deleted && <button type="button" onClick={async () => { if (confirm("Delete this message for everyone?")) { await deleteMessage(m.id); await poll(); } }} className="absolute -left-8 top-1/2 hidden -translate-y-1/2 rounded-md p-1 text-muted hover:text-red-600 group-hover:block" aria-label="Delete message"><Trash2 className="size-3.5" /></button>}
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
          <div ref={listEnd} />
        </div>
        <div className="border-t border-line bg-surface p-2 sm:p-3">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          {file && <p className="mb-2 flex items-center gap-2 rounded-lg bg-canvas px-3 py-1.5 text-xs"><Paperclip className="size-3.5" /><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }} aria-label="Remove file"><X className="size-3.5" /></button></p>}
          <div className="flex items-end gap-2">
            {me.canFiles && (
              <label className="relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink" title="Attach a photo or PDF">
                <Paperclip className="size-5" />
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder="Type a message"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
              className="input max-h-32 min-h-10 flex-1 resize-none py-2" style={{ fieldSizing: "content" } as React.CSSProperties} aria-label="Message" />
            <button type="button" onClick={() => void send()} disabled={sending || (!draft.trim() && !file)} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white transition hover:bg-navy-800 disabled:opacity-40" aria-label="Send"><SendHorizontal className="size-5" /></button>
          </div>
          <p className="mt-1 hidden text-[11px] text-muted sm:block">Enter to send · Shift + Enter for a new line</p>
        </div>
      </>}
    </div>
  ) : (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-center text-muted md:flex">
      <MessagesSquare className="size-12 text-navy-900/20" />
      <p className="font-medium text-ink">Choose a chat</p>
      <p className="max-w-xs text-sm">Talk to colleagues one-to-one or in groups. Share photos, PDFs and links to leads or deals.</p>
    </div>
  );

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-11.5rem)] overflow-hidden border-line bg-surface sm:mx-0 sm:my-0 sm:rounded-xl sm:border lg:h-[calc(100dvh-7rem)]">
      {list}
      {panel === "new" || panel === "group" ? <div className={cn("flex min-h-0 flex-1 flex-col", !active && "fixed inset-0 z-30 bg-surface md:static")}>{picker(panel)}</div> : conversation}
    </div>
  );
}
