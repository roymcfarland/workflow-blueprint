import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/boards",
        "/profile",
        "/admin",
        "/api",
        "/sign-up",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
