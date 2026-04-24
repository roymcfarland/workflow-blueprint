import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth";
import { updateUserTheme } from "@/lib/data";
import { themePreferenceSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const user = await requireCurrentUser();
  const payload = themePreferenceSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Unable to update theme." },
      { status: 400 },
    );
  }

  const themePreference = await updateUserTheme(user.id, payload.data.themePreference);

  return NextResponse.json({
    ok: true,
    themePreference,
  });
}
