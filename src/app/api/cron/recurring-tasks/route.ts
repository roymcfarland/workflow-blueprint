import { NextResponse } from "next/server";

import { purgeExpiredDemoUsers, rolloverDueRecurringTasks } from "@/lib/data";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rolledOverTaskIds, skippedTaskIds } = await rolloverDueRecurringTasks();

  let purgedDemoUserCount: number | null = null;
  let purgeError: string | null = null;

  try {
    purgedDemoUserCount = await purgeExpiredDemoUsers();
  } catch (error) {
    purgeError = error instanceof Error ? error.message : "Unable to purge expired demo accounts.";
  }

  return NextResponse.json({
    purgeError,
    purgedDemoUserCount,
    rolledOverCount: rolledOverTaskIds.length,
    rolledOverTaskIds,
    skippedCount: skippedTaskIds.length,
    skippedTaskIds,
  });
}
