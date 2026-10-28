import Link from "next/link";

/** Unknown address (outside the app shell). */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The address may be mistyped, or the page has moved.</p>
        <Link href="/home" className="mt-6 inline-block rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">Back to AMS</Link>
      </div>
    </main>
  );
}
