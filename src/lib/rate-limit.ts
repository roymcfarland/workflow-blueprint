import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = {
  limit: number;
  remaining: number;
  resetAt: Date;
  limited: boolean;
  retryAfterSeconds: number;
};

type BucketRow = {
  count: number;
  resetAt: Date;
};

const cleanupSampleRate = 0.01;

async function maybeCleanupExpiredBuckets() {
  if (Math.random() >= cleanupSampleRate) {
    return;
  }

  try {
    await prisma.$executeRaw`
      DELETE FROM "RateLimitBucket"
      WHERE "resetAt" < LOCALTIMESTAMP - INTERVAL '1 hour'
    `;
  } catch (error) {
    console.error("Rate limit cleanup failed.", error);
  }
}

async function bumpBucket(key: string, windowMs: number): Promise<BucketRow> {
  // Single atomic statement: insert a fresh bucket if none exists, otherwise
  // either reset the bucket (when its window has expired) or increment it.
  // Using a single SQL statement means concurrent invocations serialize on
  // the row lock from ON CONFLICT and cannot double-count.
  const rows = await prisma.$queryRaw<BucketRow[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, LOCALTIMESTAMP + (${windowMs} * INTERVAL '1 millisecond'), NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= LOCALTIMESTAMP THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= LOCALTIMESTAMP
          THEN LOCALTIMESTAMP + (${windowMs} * INTERVAL '1 millisecond')
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = NOW()
    RETURNING
      "count",
      "resetAt" AT TIME ZONE current_setting('TimeZone') AS "resetAt"
  `;

  const row = rows[0];

  /* v8 ignore if */
  if (!row) {
    throw new Error("RateLimitBucket upsert did not return a row.");
  }

  return row;
}

function retryAfterSecondsFor(resetAt: Date) {
  return Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
}

export async function evaluateRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitDecision> {
  let bucket: BucketRow;

  try {
    bucket = await bumpBucket(key, windowMs);
  } catch (error) {
    // Fail open: a database hiccup should not lock everyone out. The error
    // is logged so it surfaces in observability.
    console.error("Rate limit check failed; allowing request.", error);
    return {
      limit,
      remaining: limit,
      resetAt: new Date(Date.now() + windowMs),
      limited: false,
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  void maybeCleanupExpiredBuckets();

  return {
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    limited: bucket.count > limit,
    retryAfterSeconds: retryAfterSecondsFor(bucket.resetAt),
  };
}

export async function checkRateLimit(
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const decision = await evaluateRateLimit(options);

  if (!decision.limited) {
    return null;
  }

  return NextResponse.json(
    { message: "Too many attempts. Please try again shortly." },
    {
      headers: {
        "Retry-After": String(decision.retryAfterSeconds),
      },
      status: 429,
    },
  );
}
