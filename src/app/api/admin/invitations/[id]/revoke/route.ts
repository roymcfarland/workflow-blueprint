import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api";
import { revokeInvitation } from "@/lib/data";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await requireApiAdmin();

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

  return NextResponse.json({ ok: true });
}
