import { getBoardSnapshot } from "@/lib/data";
import {
  readOnlyApiError,
  readOnlyApiJson,
  requireReadOnlyApiUser,
} from "@/lib/read-only-api";
import { readOnlyBoardResponseSchema } from "@/lib/read-only-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireReadOnlyApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const { slug } = await params;
  const board = await getBoardSnapshot(user.data.userId, slug);

  if (!board) {
    return readOnlyApiError("Board not found.", 404);
  }

  return readOnlyApiJson(readOnlyBoardResponseSchema, {
    ok: true,
    data: board,
  });
}
