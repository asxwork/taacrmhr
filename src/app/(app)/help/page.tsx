import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { TUTORIALS } from "@/lib/tutorials";
import { PageHeader } from "@/components/ui";
import { TutorialsView, type Chapter } from "@/components/tutorials-view";

export const metadata = { title: "Tutorials" };

/** Tutorials: the full video tour with chapters and step-by-step guides for everything (opened from the ? in the menu). */
export default async function HelpPage() {
  await requireUser();
  const dir = path.join(process.cwd(), "public", "tutorials");
  const video = await stat(path.join(dir, "ams-tour.mp4")).then(() => "/tutorials/ams-tour.mp4").catch(() => null);
  let chapters: Chapter[] = [];
  try { chapters = JSON.parse(await readFile(path.join(dir, "chapters.json"), "utf8")); } catch {}
  return (
    <>
      <PageHeader title="Tutorials" description="Watch the full tour, or open a topic for step-by-step instructions. Each topic has a button to jump to its part of the video." />
      <TutorialsView tutorials={TUTORIALS} chapters={chapters} video={video} />
    </>
  );
}
