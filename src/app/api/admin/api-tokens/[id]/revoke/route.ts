import { NextResponse } from "next/server";

import { checkRateLimit, rateLimitKey, requireApiAdmin } from "@/lib/api";
import { recordAdminAudit } from "@/lib/audit";
import { revokeApiToken } from "@/lib/data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await requireApiAdmin(request);

  if (!currentUser.ok) {
    return currentUser.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "admin-api-token-revoke", currentUser.data.id),
    limit: 30,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { id } = await params;

  try {
    const revoked = await revokeApiToken(id);

    if (!revoked) {
      return NextResponse.json(
        { message: "API token could not be revoked." },
        { status: 404 },
      );
    }

    await recordAdminAudit({
      actor: currentUser.data.email,
      action: "api-token.revoke",
      target: revoked.label,
      metadata: {
        apiTokenId: revoked.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to revoke API token.", error);
    return NextResponse.json({ message: "Unable to revoke API token." }, { status: 500 });
  }
}
