"use client";

/** Submit button that asks before submitting its form (e.g. deleting something that can't be restored). */
export function ConfirmButton({ message, className, title, children }: { message: string; className?: string; title?: string; children: React.ReactNode }) {
  return (
    <button type="submit" title={title} aria-label={title} className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
