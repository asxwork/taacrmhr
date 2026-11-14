import { LayoutsView } from "@/app/(app)/settings/layouts/layouts-view";

export const metadata = { title: "CRM layouts" };

export default function Page({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string; app?: string; aud?: string; role?: string }> }) {
  return <LayoutsView searchParams={searchParams} base="/crm/settings/layouts" only={["crm"]} title="CRM layouts" />;
}
