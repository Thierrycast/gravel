import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const buildCpus = Number(process.env.NEXT_BUILD_CPUS ?? "")

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  experimental: {
    // Load route modules on demand instead of preloading every entry at boot —
    // cuts idle RSS significantly; first hit per route pays a one-time cost.
    preloadEntriesOnStart: false,
    ...(Number.isFinite(buildCpus) && buildCpus > 0 ? { cpus: buildCpus } : {}),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.logo.dev" },
      // Logos de instituição do Pluggy (getPluggyLogoUrl). Faltava aqui: /accounts
      // renderiza com <img> e nunca passou pelo next/image, mas /bills usa
      // LogoImage (next/image), que valida o hostname mesmo com unoptimized.
      { protocol: "https", hostname: "cdn.pluggy.ai" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default analyze(withSerwist(nextConfig));
