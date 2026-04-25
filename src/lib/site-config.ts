const fallbackSiteUrl = "https://www.workflowblueprint.io";

function normalizeSiteUrl(value: string | undefined): string {
  if (!value) {
    return fallbackSiteUrl;
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(candidate).origin;
  } catch {
    return fallbackSiteUrl;
  }
}

export const siteConfig = {
  name: "Workflow Blueprint",
  shortName: "Blueprint",
  description: "A blueprint-inspired task planning workspace for personal and team execution.",
  url: normalizeSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.SITE_URL ??
      process.env.VERCEL_PROJECT_PRODUCTION_URL ??
      process.env.VERCEL_URL,
  ),
  socialImageAlt: "Workflow Blueprint task planning workspace preview",
};
