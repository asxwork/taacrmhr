import Link from "@/components/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { TUTORIALS, TUTORIAL_GROUPS } from "@/lib/tutorials";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Tutorial progress" };

/** Who has passed which tutorial quizzes: per person, and per tutorial. Super Admins and HR. */
export default async function TutorialProgress({ searchParams }: { searchParams: Promise<{ group?: string; view?: string }> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin && !can(user, "hr.employees")) notFound();
  const sp = await searchParams;
  const group = TUTORIAL_GROUPS.find((g) => g === sp.group);
  const byTutorial = sp.view === "tutorials";
  const list = TUTORIALS.filter((t) => !group || t.group === group);
  const keys = new Set(list.map((t) => t.key));
  const [users, quizzes] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, title: true }, orderBy: { name: "asc" } }),
    db.tutorialQuiz.findMany({ where: { passedAt: { not: null } }, select: { userId: true, key: true, passedAt: true } }),
  ]);
  const passed = quizzes.filter((q) => keys.has(q.key));
  const rows = users.map((u) => { const mine = passed.filter((q) => q.userId === u.id); return { u, n: mine.length, last: mine.reduce<Date | null>((a, q) => (!a || q.passedAt! > a ? q.passedAt : a), null), keys: new Set(mine.map((q) => q.key)) }; }).sort((a, b) => b.n - a.n || a.u.name.localeCompare(b.u.name));
  const href = (o: { group?: string | null; view?: string | null }) => `/help/progress?${new URLSearchParams(Object.entries({ group: o.group === undefined ? group ?? "" : o.group ?? "", view: o.view === undefined ? (byTutorial ? "tutorials" : "") : o.view ?? "" }).filter(([, v]) => v))}`;
  return (
    <>
      <Link href="/help" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Tutorials</Link>
      <PageHeader title="Tutorial progress" description="Who has passed the quiz of each tutorial (3 questions, at least 2 right). Use it to check new staff have learned their part of AMS." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={href({ view: null })} className={cn("rounded-lg px-3 py-1.5", !byTutorial ? "bg-navy-900 text-white" : "border border-line hover:bg-canvas")}>By person</Link>
        <Link href={href({ view: "tutorials" })} className={cn("rounded-lg px-3 py-1.5", byTutorial ? "bg-navy-900 text-white" : "border border-line hover:bg-canvas")}>By tutorial</Link>
        <span className="mx-1 border-l border-line" />
        <Link href={href({ group: null })} className={cn("rounded-lg px-3 py-1.5", !group ? "bg-canvas font-medium" : "text-muted hover:text-ink")}>All</Link>
        {TUTORIAL_GROUPS.map((g) => <Link key={g} href={href({ group: g })} className={cn("rounded-lg px-3 py-1.5", group === g ? "bg-canvas font-medium" : "text-muted hover:text-ink")}>{g}</Link>)}
      </div>
      <Card className="overflow-x-auto">
        {!byTutorial ? (
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5">Passed</th><th className="px-4 py-2.5">Last quiz</th><th className="px-4 py-2.5">Tutorials passed</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ u, n, last, keys: k }) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-medium">{u.name}{u.title && <span className="block text-xs font-normal text-muted">{u.title}</span>}</td>
                  <td className="px-4 py-2.5 tabular-nums"><span className={cn("font-semibold", n ? "text-emerald-700" : "text-muted")}>{n}</span> <span className="text-xs text-muted">/ {list.length}</span></td>
                  <td className="px-4 py-2.5 text-xs text-muted">{last ? format(last, "d MMM yyyy") : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{list.filter((t) => k.has(t.key)).map((t) => t.title).slice(0, 6).join(" · ")}{k.size > 6 ? ` · +${k.size - 6} more` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Tutorial</th><th className="px-4 py-2.5">Group</th><th className="px-4 py-2.5">People passed</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((t) => { const n = passed.filter((q) => q.key === t.key).length; return (
                <tr key={t.key}><td className="px-4 py-2.5 font-medium">{t.title}</td><td className="px-4 py-2.5 text-xs text-muted">{t.group}</td><td className="px-4 py-2.5"><span className="font-semibold tabular-nums">{n}</span> <span className="text-xs text-muted">of {users.length}</span></td></tr>
              ); })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
