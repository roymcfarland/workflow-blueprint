import { getBoardSnapshot } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  requireExternalApiUser,
} from "@/lib/external-api";
import { externalBoardResponseSchema } from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireExternalApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const { slug } = await params;
  const board = await getBoardSnapshot(user.data.userId, slug);

  if (!board) {
    return externalApiError("Board not found.", 404);
  }

  return externalApiJson(externalBoardResponseSchema, {
    ok: true,
    data: board,
  });
}
