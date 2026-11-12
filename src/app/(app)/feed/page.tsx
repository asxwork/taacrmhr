import { formatDistanceToNowStrict } from "date-fns";
import { Globe2, Heart, Megaphone, PartyPopper, Pin, PinOff, Trash2, Users } from "lucide-react";
import { KUDOS_BADGES, badgeLabel, feedWhere } from "@/lib/feed";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import Link from "@/components/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { cn } from "@/lib/utils";
import { deletePost, likePost, postToFeed, togglePin } from "./actions";

export const metadata = { title: "Feed" };

/** Company feed: announcements from management and kudos between colleagues. */
export default async function FeedPage({ searchParams }: { searchParams: Promise<{ compose?: string }> }) {
  const user = await requireUser();
  const { compose } = await searchParams;
  const visible = await feedWhere(user.id);
  const [posts, colleagues, departments, branches] = await Promise.all([
    db.feedPost.findMany({ where: visible, include: { employee: { select: { fullName: true, photo: true } } }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 60 }),
    db.employee.findMany({ where: { status: { not: "left" }, userId: { not: user.id } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.department.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const audienceLabel = (a: string) => {
    const [k, rest = ""] = a.split(":");
    if (k === "dept") return departments.find((d) => d.id === rest)?.name ?? "A department";
    if (k === "branch") return branches.find((b) => b.id === rest)?.name ?? "A branch";
    if (k === "people") return `${rest.split(",").length} people`;
    return null;
  };
  // Who sees it: one dropdown (everyone, a department or a branch); specific people tucked away behind a link.
  const audiencePicker = () => (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2 text-muted"><Users className="size-4" /> Visible to
        <select name="audience" defaultValue="all" className="input h-9 w-auto py-0 text-sm text-ink">
          <option value="all">Everyone</option>
          {departments.length > 0 && <optgroup label="Department">{departments.map((d) => <option key={d.id} value={`dept:${d.id}`}>{d.name}</option>)}</optgroup>}
          {branches.length > 1 && <optgroup label="Branch">{branches.map((b) => <option key={b.id} value={`branch:${b.id}`}>{b.name}</option>)}</optgroup>}
        </select>
      </label>
      <details className="group w-full">
        <summary className="cursor-pointer list-none text-xs text-navy-900 hover:underline">Only specific people instead…</summary>
        <select name="people" multiple aria-label="People" className="input mt-2 h-28 py-1 text-sm">{colleagues.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
        <p className="mt-1 text-[11px] text-muted">Hold Ctrl (⌘ on Mac) to pick several.</p>
      </details>
    </div>
  );
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(posts.map((p) => p.authorId))] } }, select: { id: true, name: true, employee: { select: { photo: true } } } });
  const author = (id: string) => authors.find((a) => a.id === id);
  const canAnnounce = can(user, "hr.feed", "create");
  const canModerate = can(user, "hr.feed", "delete");
  const mode = canAnnounce && compose === "announce" ? "announce" : "kudos";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Feed" description="Company news and shout-outs." />

      <Card className="mb-6 overflow-hidden">
        <div className="flex border-b border-line text-sm">
          <Link href="/feed" scroll={false} className={cn("flex flex-1 items-center justify-center gap-2 py-3", mode === "kudos" ? "border-b-2 border-navy-900 font-medium" : "text-muted hover:text-ink")}><PartyPopper className="size-4 text-amber-500" /> Give kudos</Link>
          {canAnnounce && <Link href="/feed?compose=announce" scroll={false} className={cn("flex flex-1 items-center justify-center gap-2 py-3", mode === "announce" ? "border-b-2 border-navy-900 font-medium" : "text-muted hover:text-ink")}><Megaphone className="size-4" /> Announcement</Link>}
        </div>
        {mode === "kudos" ? (
          <ActionForm action={postToFeed} className="space-y-3 p-4">
            <input type="hidden" name="kind" value="kudos" />
            <select name="employeeId" required aria-label="Who" className="input"><option value="">Who are you thanking?</option>{colleagues.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
            <div className="flex flex-wrap gap-1.5">
              {KUDOS_BADGES.map(([v, label]) => (
                <label key={v} className="cursor-pointer"><input type="radio" name="badge" value={v} className="peer sr-only" />
                  <span className="inline-flex rounded-full border border-line px-3 py-1 text-xs transition peer-checked:border-amber-400 peer-checked:bg-amber-50 peer-checked:text-amber-900 hover:bg-canvas">{label}</span></label>
              ))}
            </div>
            <textarea name="body" rows={2} aria-label="Message" className="input resize-none" placeholder="Say thanks… (optional with a badge)" />
            <div className="flex flex-wrap items-start justify-between gap-3">{audiencePicker()}<SubmitButton className="ml-auto">Send kudos</SubmitButton></div>
          </ActionForm>
        ) : (
          <ActionForm action={postToFeed} className="space-y-3 p-4">
            <input type="hidden" name="kind" value="announcement" />
            <input name="title" aria-label="Title" className="input font-medium" placeholder="Title, e.g. Office closed on Friday" />
            <textarea name="body" required rows={3} aria-label="Message" className="input" placeholder="Write the announcement…" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              {audiencePicker()}
              <span className="ml-auto flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" name="pinned" className="accent-navy-900" /> <Pin className="size-3.5" /> Pin</label>
                <SubmitButton><Globe2 className="size-4" /> Post</SubmitButton>
              </span>
            </div>
          </ActionForm>
        )}
      </Card>

      <div className="space-y-4">
        {posts.length === 0 && <Card><EmptyState title="Nothing here yet" description="Be the first to give a colleague kudos." /></Card>}
        {posts.map((p) => {
          const a = author(p.authorId);
          const likes = p.likes.split(",").filter(Boolean);
          const liked = likes.includes(user.id);
          const badge = p.kind === "kudos" ? badgeLabel(p.title) : null;
          return (
            <article key={p.id} className={cn("rounded-2xl border bg-surface p-5 shadow-sm", p.pinned ? "border-gold-400/60" : "border-line")}>
              <header className="flex items-center gap-3">
                <PersonAvatar name={a?.name ?? "?"} photo={a?.employee?.photo ?? null} className="size-10" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate"><span className="font-semibold">{a?.name ?? "Someone"}</span>{p.kind === "kudos" && <span className="text-muted"> → <span className="font-medium text-ink">{p.employee?.fullName}</span></span>}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    {formatDistanceToNowStrict(p.createdAt, { addSuffix: true })}
                    {p.audience !== "all" && <><span>·</span><Users className="size-3" />{audienceLabel(p.audience)}</>}
                    {p.pinned && <><span>·</span><Pin className="size-3 text-gold-600" /><span className="text-gold-700">Pinned</span></>}
                  </p>
                </div>
                {p.kind === "kudos" ? <PartyPopper className="size-5 text-amber-500" /> : <Megaphone className="size-5 text-navy-900" />}
              </header>
              <div className="mt-3 space-y-1.5">
                {badge && <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">{badge}</span>}
                {p.kind === "announcement" && p.title && <h2 className="text-lg font-semibold">{p.title}</h2>}
                {p.body && <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.body}</p>}
              </div>
              <footer className="mt-4 flex items-center gap-1 border-t border-line pt-2">
                <form action={likePost}><input type="hidden" name="id" value={p.id} />
                  <button className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:bg-canvas", liked ? "text-red-600" : "text-muted")} aria-label={liked ? "Unlike" : "Like"}>
                    <Heart className={cn("size-4", liked && "fill-current")} /> {likes.length || "Love"}
                  </button>
                </form>
                {(canAnnounce || canModerate) && (
                  <form action={togglePin}><input type="hidden" name="id" value={p.id} />
                    <button className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-canvas" aria-label={p.pinned ? "Unpin" : "Pin to top"}>
                      {p.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />} {p.pinned ? "Unpin" : "Pin"}
                    </button>
                  </form>
                )}
                {(p.authorId === user.id || canModerate) && (
                  <form action={deletePost} className="ml-auto"><input type="hidden" name="id" value={p.id} /><button className="rounded-full p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Delete post"><Trash2 className="size-4" /></button></form>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
