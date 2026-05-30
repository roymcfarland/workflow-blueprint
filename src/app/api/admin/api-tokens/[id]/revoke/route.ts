import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api";
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

  const { id } = await params;
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
}
