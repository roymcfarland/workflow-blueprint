const isDevelopment = process.env.NODE_ENV === "development";
const isProductionDeployment = process.env.VERCEL_ENV === "production";

/**
 * Single source of truth for the Content-Security-Policy.
 *
 * - `script-src` keeps a per-request nonce + 'strict-dynamic' on page responses
 *   (the baseline used by next.config has no nonce). This is the real XSS guard.
 * - `style-src` intentionally uses 'unsafe-inline' without a nonce: the app
 *   renders dynamic accent colors via inline `style=` attributes, and per CSP3
 *   a nonce in the directive causes browsers to ignore 'unsafe-inline' while a
 *   nonce cannot attach to a style attribute.
 */
export function buildContentSecurityPolicy({ nonce }: { nonce?: string } = {}) {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`
    : `script-src 'self'${isDevelopment ? " 'unsafe-eval'" : ""}`;

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
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
