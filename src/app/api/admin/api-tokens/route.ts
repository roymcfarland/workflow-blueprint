import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey, requireApiAdmin } from "@/lib/api";
import { recordAdminAudit } from "@/lib/audit";
import { createApiToken, listApiTokens } from "@/lib/data";
import { adminApiTokenSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const currentUser = await requireApiAdmin(request);

  if (!currentUser.ok) {
    return currentUser.response;
  }

  return NextResponse.json({
    apiTokens: await listApiTokens(),
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
    adminApiTokenSchema,
    "Unable to create API token.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "admin-api-token", currentUser.data.id),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { apiToken, token } = await createApiToken({
      createdById: currentUser.data.id,
      label: payload.data.label,
    });

    await recordAdminAudit({
      actor: currentUser.data.email,
      action: "api-token.create",
      target: apiToken.label,
      metadata: {
        apiTokenId: apiToken.id,
        prefix: apiToken.prefix,
      },
    });

    return NextResponse.json({ apiToken, ok: true, token });
  } catch (error) {
    console.error("Unable to create API token.", error);
    return NextResponse.json({ message: "Unable to create API token." }, { status: 500 });
  }
}
