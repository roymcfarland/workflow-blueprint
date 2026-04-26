import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const isProductionDeployment = process.env.VERCEL_ENV === "production";
type HeaderConfig = Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>[number]["headers"];

// Baseline CSP applied to every response. The proxy at src/proxy.ts overrides
// this with a nonce-based CSP for HTML page responses. API routes and static
// assets keep this strict default since they never need to execute scripts.
const baselineCspDirectives = [
  "default-src 'self'",
  `script-src 'self'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
];

if (isProductionDeployment) {
  baselineCspDirectives.push("upgrade-insecure-requests");
}

const baselineContentSecurityPolicy = baselineCspDirectives.join("; ");

const permissionsPolicy = [
  "accelerometer=()",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "interest-cohort=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: baselineContentSecurityPolicy,
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "Permissions-Policy",
    value: permissionsPolicy,
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
] satisfies HeaderConfig;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  poweredByHeader: false,
  reactCompiler: true,
};

export default nextConfig;
