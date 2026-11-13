import { requirePermission } from "@/lib/permissions";
import { EntriesView, type EntrySP } from "../entries-view";

export const metadata = { title: "Sir personal · Finance" };

export default async function PersonalPage({ searchParams }: { searchParams: Promise<EntrySP> }) {
  const user = await requirePermission("finance");
  return <EntriesView user={user} sp={await searchParams} personal base="/finance/personal" />;
}
