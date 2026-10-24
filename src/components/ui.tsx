import Link from "next/link";
import { Inbox, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white shadow-sm shadow-navy-950/20 hover:bg-navy-800",
  secondary: "border border-line bg-surface text-ink shadow-xs hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas hover:text-ink",
  danger: "border border-red-200 bg-surface text-red-600 hover:bg-red-50",
};

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cn(buttonBase, buttonVariants[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[13px] font-medium text-ink/85">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card rounded-xl border border-line bg-surface", className)} {...props} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-gold-700">{eyebrow}</p>}
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "green" | "amber" | "red" | "navy" | "gold";
const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-muted border-line",
  green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  red: "bg-red-50 text-red-700 border-red-100",
  navy: "bg-navy-900/5 text-navy-900 border-navy-900/10",
  gold: "bg-gold-100 text-gold-700 border-gold-300/50",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-canvas text-muted" aria-hidden><Inbox className="size-5" /></span>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-900/8 text-xs font-semibold text-navy-900", className)}>
      {initials(name)}
    </span>
  );
}

/** Bitrix-style side panel. Opened via a search param; closing navigates to `closeHref`. */
export function Drawer({ title, closeHref, children, width = "max-w-lg" }: { title: string; closeHref: string; children: React.ReactNode; width?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-navy-950/30 backdrop-blur-[1px]" />
      <aside className={cn("relative flex h-full w-full flex-col bg-surface shadow-2xl", width)}>
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-semibold">{title}</h2>
          <Link href={closeHref} scroll={false} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </Link>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}
