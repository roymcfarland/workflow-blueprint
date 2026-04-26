import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api";
import { recordAdminAudit } from "@/lib/audit";
import { revokeInvitation } from "@/lib/data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await requireApiAdmin(request);

  if (!currentUser.ok) {
    return currentUser.response;
  }

  const { id } = await params;
  const revoked = await revokeInvitation(id);

  if (!revoked) {
    return NextResponse.json(
      { message: "Invitation could not be revoked." },
      { status: 404 },
    );
  }

  await recordAdminAudit({
    actor: currentUser.data.email,
    action: "invitation.revoke",
    target: revoked.email,
    metadata: {
      invitationId: revoked.id,
    },
  });

  return NextResponse.json({ ok: true });
}
