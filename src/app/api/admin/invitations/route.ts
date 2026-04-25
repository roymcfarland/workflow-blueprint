import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey, requireApiAdmin } from "@/lib/api";
import { createInvitation, findUserByEmail, listInvitations } from "@/lib/data";
import { buildAppUrl, sendInviteEmail } from "@/lib/email";
import { adminInvitationSchema } from "@/lib/validators";

export async function GET() {
  const currentUser = await requireApiAdmin();

  if (!currentUser.ok) {
    return currentUser.response;
  }

  const invitations = await listInvitations();

  return NextResponse.json({
    invitations,
    ok: true,
  });
}

export async function POST(request: Request) {
  const currentUser = await requireApiAdmin();

  if (!currentUser.ok) {
    return currentUser.response;
  }

  const payload = await parseJsonPayload(
    request,
    adminInvitationSchema,
    "Unable to create invitation.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  const rateLimitResponse = checkRateLimit({
    key: rateLimitKey(request, "admin-invitation", `${currentUser.data.id}:${payload.data.email}`),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const existingUser = await findUserByEmail(payload.data.email);

  if (existingUser) {
    return NextResponse.json(
      { message: "That email address already has an account." },
      { status: 409 },
    );
  }

  const { invitation, token } = await createInvitation({
    email: payload.data.email,
    invitedById: currentUser.data.id,
  });
  const inviteUrl = buildAppUrl(`/sign-up?invite=${encodeURIComponent(token)}`);
  const isProduction = process.env.NODE_ENV === "production";
  let message = "Invitation sent.";

  try {
    const delivery = await sendInviteEmail({
      inviteUrl,
      to: invitation.email,
    });

    if (delivery.status === "skipped") {
      message = "Email is not configured locally. Use the preview invitation link below.";
    }
  } catch (error) {
    console.error("Unable to send invitation email.", error);

    if (isProduction) {
      return NextResponse.json({ message: "Unable to send invitation." }, { status: 500 });
    }

    message = "Email delivery failed locally. Use the preview invitation link below.";
  }

  return NextResponse.json({
    invitation,
    message: isProduction ? "Invitation sent." : message,
    ok: true,
    previewInviteUrl: isProduction ? undefined : inviteUrl,
  });
}
