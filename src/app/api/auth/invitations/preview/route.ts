import { NextResponse } from "next/server";

import { checkRateLimit, rateLimitKey } from "@/lib/api";
import { getInvitationPreviewByToken } from "@/lib/data";
import { invitePreviewSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const payload = invitePreviewSchema.safeParse({ token });

  if (!payload.success) {
    /* v8 ignore next */
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Invite token is required." },
      { status: 400 },
    );
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "invite-preview", payload.data.token),
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const invitation = await getInvitationPreviewByToken(payload.data.token);

  if (!invitation) {
    return NextResponse.json(
      { message: "That invitation is invalid or has expired." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    invitation,
    ok: true,
  });
}
