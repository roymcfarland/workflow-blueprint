import { NextResponse, type NextRequest } from "next/server";

const isDevelopment = process.env.NODE_ENV === "development";
const isProductionDeployment = process.env.VERCEL_ENV === "production";

function buildCspHeader(nonce: string) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    // Next.js + React inject inline styles for fonts and runtime; allow them
    // via nonce in production. In development the dev runtime emits styles
    // without the nonce, so fall back to 'unsafe-inline' in dev only.
    `style-src 'self' ${isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}' 'unsafe-inline'`}`,
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
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const cspHeader = buildCspHeader(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image|twitter-image|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
