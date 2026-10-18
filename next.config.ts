import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is personal and read at request time (it depends on who is
  // signed in), so the simpler request-time rendering model is used instead of
  // Cache Components.
  cacheComponents: false,
  // The Excel template is read from disk by the export route; make sure it is
  // bundled with that function when deployed.
  outputFileTracingIncludes: {
    "/api/export": ["./src/lib/excel/template.xlsx"],
  },
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
