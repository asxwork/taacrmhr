import { formatDistanceToNowStrict } from "date-fns";
import { Globe2, Heart, Megaphone, PartyPopper, Pin, PinOff, Trash2, Users } from "lucide-react";
import { KUDOS_BADGES, badgeLabel, feedWhere } from "@/lib/feed";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { cn } from "@/lib/utils";
import { deletePost, likePost, postToFeed, togglePin } from "./actions";

export const metadata = { title: "Feed" };

/** Company feed: announcements from management and kudos between colleagues. */
export default async function FeedPage() {
  const user = await requireUser();
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
  // Who sees it: one picker shared by both forms (radio + the matching list). Plain HTML, no script needed.
  const audiencePicker = (id: string) => (
    <fieldset className="space-y-2 rounded-lg border border-line p-3">
      <legend className="px-1 text-xs font-medium text-muted">Who can see it</legend>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="audience" value="all" defaultChecked /> Everyone</label>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="audience" value="dept" /> A department
        <select name="deptId" aria-label="Department" className="input ml-auto h-8 w-40 py-0 text-xs"><option value="">Choose…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="audience" value="branch" /> A branch
        <select name="branchId" aria-label="Branch" className="input ml-auto h-8 w-40 py-0 text-xs"><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="flex items-start gap-2 text-sm"><input type="radio" name="audience" value="people" className="mt-1" /> Chosen people
        <select name="people" multiple aria-label="People" id={`${id}-people`} className="input ml-auto h-20 w-40 py-1 text-xs">{colleagues.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></label>
      <p className="text-[11px] text-muted">Hold Ctrl (⌘ on Mac) to pick several people.</p>
    </fieldset>
  );
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(posts.map((p) => p.authorId))] } }, select: { id: true, name: true, employee: { select: { photo: true } } } });
  const author = (id: string) => authors.find((a) => a.id === id);
  const canAnnounce = can(user, "hr.feed", "create");
  const canModerate = can(user, "hr.feed", "delete");

  return (
    <>
      <PageHeader title="Feed" description="Company news and shout-outs. Thank a colleague with kudos — everyone can see it." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {posts.length === 0 && <Card><EmptyState title="Nothing here yet" description="Be the first to give a colleague kudos." /></Card>}
          {posts.map((p) => {
            const a = author(p.authorId);
            const likes = p.likes.split(",").filter(Boolean);
            const liked = likes.includes(user.id);
            return (
              <Card key={p.id} className={cn("p-4", p.kind === "announcement" && "border-navy-900/20", p.pinned && "ring-1 ring-gold-600/40")}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <PersonAvatar name={a?.name ?? "?"} photo={a?.employee?.photo ?? null} className="size-8" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{a?.name ?? "Someone"}</span>
                    {p.kind === "kudos" ? <span className="text-muted"> gave kudos to <span className="font-medium text-ink">{p.employee?.fullName}</span></span> : <span className="text-muted"> posted an announcement</span>}
                    <span className="block text-xs text-muted">{formatDistanceToNowStrict(p.createdAt, { addSuffix: true })}</span>
                  </span>
                  {p.audience !== "all" && <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted" title="Only these people see it"><Users className="size-3" />{audienceLabel(p.audience)}</span>}
                  {p.pinned && <Pin className="size-4 text-gold-600" aria-label="Pinned" />}
                  {p.kind === "kudos" ? <PartyPopper className="size-5 text-amber-500" /> : <Megaphone className="size-5 text-navy-900" />}
                </div>
                {p.kind === "kudos" && badgeLabel(p.title) ? <span className="mb-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">{badgeLabel(p.title)}</span>
                  : p.title && <h2 className="mb-1 font-semibold">{p.title}</h2>}
                <p className="whitespace-pre-line text-sm">{p.body}</p>
                <div className="mt-3 flex items-center gap-3">
                  <form action={likePost}><input type="hidden" name="id" value={p.id} />
                    <button className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs hover:bg-canvas", liked ? "text-red-600" : "text-muted")} aria-label={liked ? "Unlike" : "Like"}>
                      <Heart className={cn("size-4", liked && "fill-current")} /> {likes.length || ""}
                    </button>
                  </form>
                  {(canAnnounce || canModerate) && (
                    <form action={togglePin}><input type="hidden" name="id" value={p.id} />
                      <button className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs hover:bg-canvas", p.pinned ? "text-gold-600" : "text-muted")} aria-label={p.pinned ? "Unpin" : "Pin to top"} title={p.pinned ? "Unpin" : "Pin to top"}>
                        {p.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />} {p.pinned ? "Unpin" : "Pin"}
                      </button>
                    </form>
                  )}
                  {(p.authorId === user.id || canModerate) && (
                    <form action={deletePost} className="ml-auto"><input type="hidden" name="id" value={p.id} /><button className="rounded p-1 text-muted hover:text-red-600" aria-label="Delete post"><Trash2 className="size-4" /></button></form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        <div className="space-y-4 lg:order-last">
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><PartyPopper className="size-4 text-amber-500" /> Give kudos</h2>
            <ActionForm action={postToFeed} className="space-y-3">
              <input type="hidden" name="kind" value="kudos" />
              <Field label="To"><select name="employeeId" required className="input"><option value="">Choose a colleague</option>{colleagues.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Badge</legend>
                <div className="flex flex-wrap gap-1.5">
                  {KUDOS_BADGES.map(([v, label]) => (
                    <label key={v} className="cursor-pointer"><input type="radio" name="badge" value={v} className="peer sr-only" />
                      <span className="inline-flex rounded-full border border-line px-2.5 py-1 text-xs transition peer-checked:border-amber-400 peer-checked:bg-amber-50 peer-checked:text-amber-900 hover:bg-canvas">{label}</span></label>
                  ))}
                </div>
              </fieldset>
              <Field label="Message (optional with a badge)"><textarea name="body" rows={3} className="input" placeholder="Thanks for staying late to close the DHA deal!" /></Field>
              {audiencePicker("k")}
              <SubmitButton>Send kudos</SubmitButton>
            </ActionForm>
          </Card>
          {canAnnounce && (
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 font-medium"><Megaphone className="size-4" /> Announcement</h2>
              <ActionForm action={postToFeed} className="space-y-3">
                <input type="hidden" name="kind" value="announcement" />
                <Field label="Title"><input name="title" className="input" placeholder="Office closed on Friday" /></Field>
                <Field label="Message"><textarea name="body" required rows={4} className="input" /></Field>
                {audiencePicker("a")}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" /> Pin to the top</label>
                <SubmitButton><Globe2 className="size-4" /> Post</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
