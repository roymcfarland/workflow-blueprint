import { z } from "zod";

import { resolveDatabaseUrl } from "@/lib/database-url";

const productionAuthSecretMinLength = 32;
const isProductionRuntime =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().optional(),
);

const requiredString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string({
    error: "Required.",
  }),
);

const productionAuthSecret = z.string().refine(
  (value) => !isProductionRuntime || value.length >= productionAuthSecretMinLength,
  {
    message: `AUTH_SECRET must be at least ${productionAuthSecretMinLength} characters in production.`,
  },
);

const baseEnvSchema = z.object({
  AUTH_SECRET: isProductionRuntime
    ? requiredString.pipe(productionAuthSecret)
    : optionalString,
  NEXT_PUBLIC_SITE_URL: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  READ_ONLY_API_KEY: optionalString,
  READ_ONLY_USER_ID: optionalString,
  EXTERNAL_API_KEY: optionalString,
  EXTERNAL_USER_ID: optionalString,
});

let validated = false;

function readableIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const key = issue.path.join(".") || "(root)";
      return `${key}: ${issue.message}`;
    })
    .join("; ");
}

export function assertEnv() {
  if (validated) {
    return;
  }

  const result = baseEnvSchema.safeParse(process.env);

  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${readableIssues(result.error)}`);
  }

  // Confirm a database connection string is available. resolveDatabaseUrl
  // throws if none of the supported keys is set, which surfaces a clear error
  // message at boot rather than on the first request.
  resolveDatabaseUrl();

  if (isProductionRuntime) {
    if (!process.env.RESEND_API_KEY?.trim() || !process.env.EMAIL_FROM?.trim()) {
      throw new Error(
        "RESEND_API_KEY and EMAIL_FROM must be configured in production for transactional email.",
      );
    }
  }

  validated = true;
}
