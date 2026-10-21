import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/admin": ["./certificates/supabase-prod-ca-2021.crt"],
    "/api/admin/session": ["./certificates/supabase-prod-ca-2021.crt"],
    "/api/auth/[...all]": ["./certificates/supabase-prod-ca-2021.crt"],
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
