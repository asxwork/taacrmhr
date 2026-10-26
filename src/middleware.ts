import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie → login. Real validation happens server-side in getCurrentUser().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("tad_session");
  const isLogin = req.nextUrl.pathname === "/login";
  if (!hasSession && !isLogin) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|brand/|icon.png|manifest.webmanifest|api/cron|api/webhooks).*)"],
};
