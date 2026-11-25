import { readFile } from "node:fs/promises";
import path from "node:path";

let id: string | null = null;
/** The running build's id: open pages (the sign-in page) compare it to reload themselves after a deploy. */
export async function GET() {
  id ??= (await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").catch(() => "dev")).trim();
  return Response.json({ build: id }, { headers: { "Cache-Control": "no-store" } });
}
