import { notFound } from "next/navigation";

import { BoardWorkspace } from "@/components/board-workspace";
import { requireCurrentUser } from "@/lib/auth";
import { getBoardSnapshot } from "@/lib/data";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireCurrentUser();
  const { slug } = await params;
  const board = await getBoardSnapshot(user.id, slug);

  if (!board) {
    notFound();
  }

  return <BoardWorkspace board={board} key={board.id} />;
}
