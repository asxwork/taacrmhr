import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { TUTORIALS } from "@/lib/tutorials";
import { PageHeader } from "@/components/ui";
import { TutorialsView, type Chapter } from "@/components/tutorials-view";

export const metadata = { title: "Tutorials" };

/** Tutorials: the full video tour with chapters and step-by-step guides for everything (opened from the ? in the menu). */
const GROUPS: Record<string, string> = { start: "Getting started", crm: "CRM", calls: "Calls", hr: "HR", me: "My Space", admin: "Admin" };

/** Super Admins see everything; others see tutorials (and video chapters) for what their role can use. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const user = await requireUser();
  const group = GROUPS[(await searchParams).g ?? ""];
  const mine = TUTORIALS.filter((t) => user.isSuperAdmin || ((!t.module || can(user, t.module, t.action ?? "view")) && !t.superAdmin));
  const shown = group ? mine.filter((t) => t.group === group) : mine;
  const dir = path.join(process.cwd(), "public", "tutorials");
  const video = await stat(path.join(dir, "ams-tour.mp4")).then(() => "/tutorials/ams-tour.mp4").catch(() => null);
  let chapters: Chapter[] = [];
  try { chapters = JSON.parse(await readFile(path.join(dir, "chapters.json"), "utf8")); } catch {}
  // Only the parts of the video tour that cover this person's tutorials (Super Admins: the whole tour).
  if (!user.isSuperAdmin) { const keys = new Set(["start", ...mine.map((t) => t.chapter)]); chapters = chapters.filter((c) => keys.has(c.key)); }
  return (
    <>
      <PageHeader title={group ? `${group} tutorials` : "Tutorials"} description={user.isSuperAdmin ? "Everything in AMS: the full video tour and every guide. Each topic can jump to its part of the video." : "The guides for what your role can use. Open a topic for steps, or jump to its part of the video."} />
      <TutorialsView tutorials={shown} chapters={chapters} video={video} />
    </>
  );
}
