import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import { getAppearance } from "@/lib/appearance-server";
import { appearanceStyle, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { fileUrl } from "@/lib/files";

// Every page reads branding/settings from the database, so render per request instead of
// prerendering at build time (which needs a live DB and crashes Prisma on Hostinger's thread limits).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "The Advisor Associates", template: "%s · The Advisor Associates" },
  description: "CRM & HR platform",
  appleWebApp: { capable: true, title: "Advisor", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/brand/icon.svg", type: "image/svg+xml" }], apple: "/brand/icon.png" },
};

export const viewport: Viewport = { themeColor: "#0A223C" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Branding must never take the whole site down: if the database can't be read, use the default look
  // (the page itself then shows what's wrong, e.g. on the login form).
  const appearance = await getAppearance().catch((e) => { console.error("[layout] appearance unavailable:", e?.code ?? e?.message); return DEFAULT_APPEARANCE; });
  return (
    <html lang="en" data-theme={appearance.theme} style={appearanceStyle(appearance, fileUrl) as React.CSSProperties}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
