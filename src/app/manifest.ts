import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Couple Expense Tracker",
    short_name: "Couple Expenses",
    description: "Raja & Jo's shared expense log",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#1f3a52",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
