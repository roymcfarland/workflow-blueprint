import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();
const environment =
  process.env.SENTRY_ENVIRONMENT?.trim() ||
  process.env.VERCEL_ENV ||
  "development";
const release =
  process.env.SENTRY_RELEASE?.trim() || process.env.VERCEL_GIT_COMMIT_SHA;

export function beforeSend(event: ErrorEvent) {
  if (event.request?.headers) {
    const headers = { ...event.request.headers };

    delete headers.authorization;
    delete headers.Authorization;

    event.request = { ...event.request, headers };
  }

  return event;
}

if (dsn) {
  Sentry.init({
    beforeSend,
    dsn,
    environment,
    release,
    sampleRate: 1,
    tracesSampleRate: 0,
  });
}
