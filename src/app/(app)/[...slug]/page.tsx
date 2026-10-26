import { notFound } from "next/navigation";
import { comingSoon } from "@/components/coming-soon";

// Menu pages planned for later. Real routes take precedence over this catch-all.
export default async function ComingSoonPage({ params }: { params: Promise<{ slug: string[] }> }) {
  return (await comingSoon("/" + (await params).slug.join("/"))) ?? notFound();
}
