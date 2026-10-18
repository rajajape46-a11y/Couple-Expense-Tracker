import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is personal and read at request time (it depends on who is
  // signed in), so the simpler request-time rendering model is used instead of
  // Cache Components.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
