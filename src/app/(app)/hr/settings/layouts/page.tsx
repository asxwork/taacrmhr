import { LayoutsView } from "@/app/(app)/settings/layouts/layouts-view";

export const metadata = { title: "HR & My Space layouts" };

export default function Page({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string; app?: string; aud?: string; role?: string }> }) {
  return <LayoutsView searchParams={searchParams} base="/hr/settings/layouts" only={["hr", "me"]} title="HR & My Space layouts" />;
}
