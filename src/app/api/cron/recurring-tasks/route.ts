import { NextResponse } from "next/server";

import { rolloverDueRecurringTasks } from "@/lib/data";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rolledOverTaskIds } = await rolloverDueRecurringTasks();

  return NextResponse.json({
    rolledOverCount: rolledOverTaskIds.length,
    rolledOverTaskIds,
  });
}
