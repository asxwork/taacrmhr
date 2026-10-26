import type { MetadataRoute } from "next";

// Lets staff "Add to Home Screen" / install the app on phones and desktops.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Advisor Associates",
    short_name: "Advisor",
    description: "CRM & HR platform",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0A223C",
    theme_color: "#0A223C",
    icons: [
      { src: "/brand/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Check in", url: "/me/attendance" },
      { name: "Leads", url: "/crm/leads" },
      { name: "Apply for leave", url: "/me/leave" },
    ],
  };
}
