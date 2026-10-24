import { notFound } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { requirePermission } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

// Placeholder for modules scheduled in later phases. Real routes take precedence over this catch-all.
export default async function ComingSoonPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const href = "/" + (await params).slug.join("/");
  const item = NAV_ITEMS.find((i) => i.href === href && i.phase);
  if (!item) notFound();

  if (item.module) await requirePermission(item.module);
  else await requireUser();

  return (
    <>
      <PageHeader title={item.label} />
      <Card>
        <EmptyState
          title={`Coming in Phase ${item.phase}`}
          description="This module is planned and your access to it is already configured."
          action={<LinkButton href="/dashboard" variant="secondary">Back to dashboard</LinkButton>}
        />
      </Card>
    </>
  );
}
