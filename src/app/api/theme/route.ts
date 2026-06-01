import { NextResponse } from "next/server";

import { checkRateLimit, parseJsonPayload, rateLimitKey, requireApiUser } from "@/lib/api";
import { updateUserTheme } from "@/lib/data";
import { themePreferenceSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const user = await requireApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const rateLimitResponse = await checkRateLimit({
    key: rateLimitKey(request, "theme-update", user.data.id),
    limit: 60,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const payload = await parseJsonPayload(
    request,
    themePreferenceSchema,
    "Unable to update theme.",
  );

  if (!payload.ok) {
    return payload.response;
  }

  const themePreference = await updateUserTheme(user.data.id, payload.data.themePreference);

  return NextResponse.json({
    ok: true,
    themePreference,
  });
}
