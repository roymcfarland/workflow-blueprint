import { NextResponse } from "next/server";

import { parseJsonPayload, requireApiUser } from "@/lib/api";
import { updateUserTheme } from "@/lib/data";
import { themePreferenceSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const user = await requireApiUser();

  if (!user.ok) {
    return user.response;
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
