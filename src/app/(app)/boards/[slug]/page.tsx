import { notFound } from "next/navigation";

import { BoardWorkspace } from "@/components/board-workspace";
import { requireCurrentUser } from "@/lib/auth";
import { getBoardSnapshot } from "@/lib/data";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requireCurrentUser();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const board = await getBoardSnapshot(user.id, slug);

  if (!board) {
    notFound();
  }

  return (
    <BoardWorkspace
      autoOpenNewTask={query.new === "1"}
      board={board}
      key={board.id}
    />
  );
}
