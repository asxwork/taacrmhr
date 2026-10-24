import { Card, EmptyState, LinkButton } from "@/components/ui";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <Card>
      <EmptyState
        title="You don't have access to this page"
        description="Your role doesn't include this module. Ask an administrator if you need it."
        action={<LinkButton href="/dashboard" variant="secondary">Back to dashboard</LinkButton>}
      />
    </Card>
  );
}
