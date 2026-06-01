import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey, requireApiAdmin } from "@/lib/api";
import { recordAdminAudit } from "@/lib/audit";
import { createInvitation, listInvitations, userExistsByEmail } from "@/lib/data";
import { buildAppUrl, sendInviteEmail } from "@/lib/email";
import { adminInvitationSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const currentUser = await requireApiAdmin(request);

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
  const currentUser = await requireApiAdmin(request);

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

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "admin-invitation", `${currentUser.data.id}:${payload.data.email}`),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    if (await userExistsByEmail(payload.data.email)) {
      return NextResponse.json(
        { message: "That email address already has an account." },
        { status: 409 },
      );
    }

    const { invitation, token } = await createInvitation({
      email: payload.data.email,
      invitedById: currentUser.data.id,
    });

    await recordAdminAudit({
      actor: currentUser.data.email,
      action: "invitation.create",
      target: invitation.email,
      metadata: {
        invitationId: invitation.id,
        expiresAt: invitation.expiresAt,
      },
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
        const productionEmailFailureStatus = 500;

        return NextResponse.json(
          { message: "Unable to send invitation." },
          { status: productionEmailFailureStatus },
        );
      }

      message = "Email delivery failed locally. Use the preview invitation link below.";
    }

    return NextResponse.json({
      invitation,
      message: isProduction ? "Invitation sent." : message,
      ok: true,
      previewInviteUrl: isProduction ? undefined : inviteUrl,
    });
  } catch (error) {
    console.error("Unable to create invitation.", error);
    return NextResponse.json({ message: "Unable to create invitation." }, { status: 500 });
  }
}
