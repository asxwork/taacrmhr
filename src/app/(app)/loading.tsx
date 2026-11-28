/** Shown the moment a page is opened, while its data loads: the frame stays, the content area shows a light skeleton. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-7 w-56 rounded-lg bg-black/[0.06]" />
      <div className="mb-6 h-4 w-80 max-w-full rounded bg-black/[0.04]" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-black/[0.04]" />)}</div>
      <div className="space-y-2 rounded-xl border border-line bg-surface p-4">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 rounded-lg bg-black/[0.04]" />)}</div>
    </div>
  );
}
