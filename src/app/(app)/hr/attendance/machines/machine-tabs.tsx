import Link from "@/components/link";
import { Cpu, History, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Machines / Logs / Mapping tabs at the top of the machine pages (ResourceInn layout). */
export function MachineTabs({ active, mappingHref }: { active: "machines" | "logs" | "mapping"; mappingHref?: string }) {
  const tab = (key: string, href: string, Icon: React.ComponentType<{ className?: string }>, label: string) => (
    <Link href={href} className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm", active === key ? "border-navy-900 font-medium" : "border-transparent text-muted hover:text-ink")}><Icon className="size-4" /> {label}</Link>
  );
  return (
    <div className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-line">
      {tab("machines", "/hr/attendance/machines", Cpu, "Machines")}
      {tab("logs", "/hr/attendance/machines/logs", History, "Logs")}
      {mappingHref && tab("mapping", mappingHref, Users, "User mapping")}
    </div>
  );
}
