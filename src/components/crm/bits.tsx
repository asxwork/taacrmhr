import Link from "next/link";
import { ChevronLeft, ChevronRight, KanbanSquare, List } from "lucide-react";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";

export function StatusPill({ name, colorName }: { name: string; colorName: string }) {
  const c = color(colorName);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", c.pill)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {name}
    </span>
  );
}

/** Builds hrefs that keep current filters while changing some params. */
export function hrefWith(base: string, current: Record<string, string | undefined>, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function ViewToggle({ base, sp, view }: { base: string; sp: Record<string, string | undefined>; view: "list" | "board" }) {
  const item = (v: "list" | "board", Icon: typeof List, label: string) => (
    <Link
      href={hrefWith(base, sp, { view: v, page: undefined })}
      className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", view === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}
    >
      <Icon className="size-4" /> {label}
    </Link>
  );
  return (
    <div className="flex rounded-lg bg-black/5 p-0.5">
      {item("board", KanbanSquare, "Board")}
      {item("list", List, "List")}
    </div>
  );
}

export function Pagination({ base, sp, page, pageSize, total }: { base: string; sp: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="px-4 py-3 text-xs text-muted">{total} record{total === 1 ? "" : "s"}</p>;
  const link = (p: number, children: React.ReactNode, disabled: boolean) =>
    disabled ? (
      <span className="rounded p-1 text-muted/40">{children}</span>
    ) : (
      <Link href={hrefWith(base, sp, { page: p === 1 ? undefined : String(p) })} className="rounded p-1 text-muted hover:bg-canvas hover:text-ink">
        {children}
      </Link>
    );
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs text-muted">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        {link(page - 1, <ChevronLeft className="size-4" />, page <= 1)}
        <span className="px-1">
          {page} / {pages}
        </span>
        {link(page + 1, <ChevronRight className="size-4" />, page >= pages)}
      </div>
    </div>
  );
}

/** List-view stage indicator: one segment per step, filled up to the current one, name underneath. */
export function StageProgress({ steps, currentId, name, colorName, kind }: { steps: { id: string }[]; currentId: string; name: string; colorName: string; kind?: string }) {
  const index = steps.findIndex((s) => s.id === currentId);
  const finished = kind === "converted" || kind === "won" || kind === "junk" || kind === "lost";
  const filled = finished ? steps.length : index + 1;
  const bar = color(kind === "junk" || kind === "lost" ? "red" : kind === "converted" || kind === "won" ? "green" : colorName).bar;
  return (
    <div className="w-40">
      <div className="flex gap-0.5" aria-hidden>
        {steps.map((s, i) => (
          <span key={s.id} className={cn("h-1.5 flex-1 first:rounded-l-full last:rounded-r-full", i < filled ? bar : "bg-black/[0.07]")} />
        ))}
      </div>
      <p className="mt-1 truncate text-xs text-muted">{name}</p>
    </div>
  );
}

/** Bitrix-style chevron progress bar. Each step is a submit button in a form bound to `action`. */
export function StageBar({
  steps,
  currentId,
  action,
  hidden,
  disabled,
  size = "sm",
  after,
}: {
  steps: { id: string; name: string; color: string }[];
  currentId: string;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  disabled?: boolean;
  /** "lg" is the full-width bar at the top of a record page. */
  size?: "sm" | "lg";
  /** Extra steps after the regular ones (e.g. a "Convert" finish step). */
  after?: React.ReactNode;
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentId);
  const activeColor = color(steps[currentIndex]?.color ?? "slate").bar;
  return (
    <form action={action} className="flex overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {steps.map((s, i) => {
        const reached = currentIndex >= 0 && i <= currentIndex;
        return (
          <button
            key={s.id}
            name="stepId"
            value={s.id}
            disabled={disabled || s.id === currentId}
            title={s.name}
            className={cn(
              "relative flex-1 truncate font-medium transition disabled:cursor-default",
              size === "lg" ? "min-w-28 px-5 py-2.5 text-left text-[13px]" : "min-w-24 px-4 py-2 text-xs",
              // Hidden inputs come first in the form, so position is decided by index, not :first/:last.
              i === 0 ? "rounded-l-lg [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%)]"
                : i === steps.length - 1 && !after ? "-ml-1 rounded-r-lg [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,8px_50%)]"
                : "-ml-1 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%,8px_50%)]",
              reached ? cn(activeColor, "text-white") : "bg-black/5 text-muted enabled:hover:bg-black/10 enabled:hover:text-ink",
            )}
          >
            {s.name}
          </button>
        );
      })}
      {after}
    </form>
  );
}

/** Chevron-shaped finish step that sits at the end of a StageBar (a link, not a stage change). */
export const CHEVRON_LAST = "-ml-1 [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,8px_50%)] rounded-r-lg";

export function InfoList({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="text-right">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
