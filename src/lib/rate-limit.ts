import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
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
    await prisma.rateLimitBucket.deleteMany({
      where: {
        resetAt: {
          lt: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    });
  } catch (error) {
    console.error("Rate limit cleanup failed.", error);
  }
}

async function bumpBucket(key: string, windowMs: number): Promise<BucketRow> {
  const newResetAt = new Date(Date.now() + windowMs);

  // Single atomic statement: insert a fresh bucket if none exists, otherwise
  // either reset the bucket (when its window has expired) or increment it.
  // Using a single SQL statement means concurrent invocations serialize on
  // the row lock from ON CONFLICT and cannot double-count.
  const rows = await prisma.$queryRaw<BucketRow[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${newResetAt}, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${newResetAt}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = NOW()
    RETURNING "count", "resetAt"
  `;

  const row = rows[0];

  if (!row) {
    throw new Error("RateLimitBucket upsert did not return a row.");
  }

  return row;
}

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<NextResponse | null> {
  let bucket: BucketRow;

  try {
    bucket = await bumpBucket(key, windowMs);
  } catch (error) {
    // Fail open: a database hiccup should not lock everyone out. The error
    // is logged so it surfaces in observability.
    console.error("Rate limit check failed; allowing request.", error);
    return null;
  }

  void maybeCleanupExpiredBuckets();

  if (bucket.count <= limit) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt.getTime() - Date.now()) / 1000),
  );

  return NextResponse.json(
    { message: "Too many attempts. Please try again shortly." },
    {
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
      status: 429,
    },
  );
}
