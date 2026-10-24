// Shown instantly while a page's data loads, so navigation never feels frozen.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-7 space-y-2">
        <div className="h-3 w-28 rounded bg-line" />
        <div className="h-8 w-64 rounded-lg bg-line" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-line/60" />)}
      </div>
      <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-line/50" />)}
      </div>
    </div>
  );
}
