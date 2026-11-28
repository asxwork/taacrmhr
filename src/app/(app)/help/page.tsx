import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { visibleTutorials } from "@/lib/tutorial-access";
import { PageHeader } from "@/components/ui";
import { TutorialsView, type Chapter } from "@/components/tutorials-view";
import { sectionVideos, videoVersions } from "@/lib/section-videos";
import { db } from "@/lib/db";
import { disabledFeatures } from "@/lib/features";
import { can } from "@/lib/permissions";
import Link from "@/components/link";

export const metadata = { title: "Tutorials" };

/** Tutorials: the full video tour with chapters and step-by-step guides for everything (opened from the ? in the menu). */
const GROUPS: Record<string, string> = { start: "Getting started", crm: "CRM", calls: "Calls", hr: "HR", finance: "Finance", me: "My Space", admin: "Admin" };

/** Super Admins see everything; others see tutorials (and video chapters) for what their role can use. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const user = await requireUser();
  const group = GROUPS[(await searchParams).g ?? ""];
  const mine = visibleTutorials(user);
  const shown = group ? mine.filter((t) => t.group === group) : mine;
  const dir = path.join(process.cwd(), "public", "tutorials");
  const video = await stat(path.join(dir, "ams-tour.mp4")).then(() => "/tutorials/ams-tour.mp4").catch(() => null);
  let chapters: Chapter[] = [];
  try { chapters = JSON.parse(await readFile(path.join(dir, "chapters.json"), "utf8")); } catch {}
  // Only the parts of the video tour that cover this person's tutorials (Super Admins: the whole tour).
  // The video can only play those parts: each allowed chapter runs until the next chapter of the full tour starts.
  let ranges: [number, number][] | null = null;
  if (!user.isSuperAdmin) {
    const keys = new Set(["start", ...mine.map((t) => t.chapter)]);
    const sorted = [...chapters].sort((a, b) => a.start - b.start);
    ranges = sorted.map((c, i) => [c, sorted[i + 1]?.start ?? Number.MAX_SAFE_INTEGER] as const).filter(([c]) => keys.has(c.key)).map(([c, end]) => [c.start, end]);
    chapters = chapters.filter((c) => keys.has(c.key));
  }
  const quizOn = !(await disabledFeatures()).has("tutorial-quiz");
  const passed = quizOn ? (await db.tutorialQuiz.findMany({ where: { userId: user.id, passedAt: { not: null } }, select: { key: true } })).map((q) => q.key) : null;
  const done = passed ? shown.filter((t) => passed.includes(t.key)).length : 0;
  return (
    <>
      {passed && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <span>🎓 Quizzes passed: <b>{done}</b> of {shown.length}</span>
          <span className="h-2 w-40 overflow-hidden rounded-full bg-canvas"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${shown.length ? Math.round((done / shown.length) * 100) : 0}%` }} /></span>
          {(user.isSuperAdmin || can(user, "hr.employees")) && <Link href="/help/progress" className="ml-auto text-navy-900 hover:underline">Everyone&apos;s progress →</Link>}
        </div>
      )}
      <PageHeader title={group ? `${group} tutorials` : "Tutorials"} description={user.isSuperAdmin ? "Everything in AMS: the full video tour and every guide. Each topic can jump to its part of the video." : "The guides for what your role can use. Open a topic for steps, or jump to its part of the video."} />
      <TutorialsView tutorials={shown} chapters={chapters} video={video} ranges={ranges} clips={await sectionVideos()} versions={await videoVersions()} passed={passed} />
    </>
  );
}
