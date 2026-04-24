import { getBoardSummaries } from "@/lib/data";
import {
  readOnlyApiJson,
  requireReadOnlyApiUser,
} from "@/lib/read-only-api";
import { readOnlyBoardsResponseSchema } from "@/lib/read-only-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireReadOnlyApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  const boards = await getBoardSummaries(user.data.userId);

  return readOnlyApiJson(readOnlyBoardsResponseSchema, {
    ok: true,
    data: {
      boards,
    },
  });
}
