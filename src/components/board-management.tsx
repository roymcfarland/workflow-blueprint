"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import type { BoardNavItem } from "@/lib/data";
import { availableBoardIcons } from "@/lib/domain";
import { cn } from "@/lib/utils";

type CreateBoardFormProps = {
  onClose: () => void;
  onCreated: () => void;
};

function CreateBoardForm({ onClose, onCreated }: CreateBoardFormProps) {
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("briefcase");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/boards/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, iconKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Unable to create board.");
        return;
      }

      onCreated();
    });
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <BlueprintInput
        autoFocus
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        placeholder="Board name"
        value={name}
      />
      <div className="flex flex-wrap gap-1.5">
        {availableBoardIcons.map((icon) => (
          <button
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border transition",
              iconKey === icon.key
                ? "border-brand bg-brand-soft text-brand"
                : "border-line-soft text-text-muted hover:border-line-strong hover:text-text-primary",
            )}
            key={icon.key}
            onClick={() => setIconKey(icon.key)}
            title={icon.label}
            type="button"
          >
            <BoardIcon className="h-4 w-4" iconKey={icon.key} />
          </button>
        ))}
      </div>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <BlueprintButton className="flex-1" disabled={isPending || !name.trim()} type="submit">
          Create
        </BlueprintButton>
        <BlueprintButton disabled={isPending} onClick={onClose} type="button" variant="ghost">
          Cancel
        </BlueprintButton>
      </div>
    </form>
  );
}

type EditBoardFormProps = {
  board: BoardNavItem;
  onClose: () => void;
  onUpdated: () => void;
};

function EditBoardForm({ board, onClose, onUpdated }: EditBoardFormProps) {
  const [name, setName] = useState(board.name);
  const [iconKey, setIconKey] = useState(board.iconKey);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/boards/manage/${board.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, iconKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Unable to update board.");
        return;
      }

      onUpdated();
    });
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <BlueprintInput
        autoFocus
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        placeholder="Board name"
        value={name}
      />
      <div className="flex flex-wrap gap-1.5">
        {availableBoardIcons.map((icon) => (
          <button
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border transition",
              iconKey === icon.key
                ? "border-brand bg-brand-soft text-brand"
                : "border-line-soft text-text-muted hover:border-line-strong hover:text-text-primary",
            )}
            key={icon.key}
            onClick={() => setIconKey(icon.key)}
            title={icon.label}
            type="button"
          >
            <BoardIcon className="h-4 w-4" iconKey={icon.key} />
          </button>
        ))}
      </div>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <BlueprintButton className="flex-1" disabled={isPending || !name.trim()} type="submit">
          Save
        </BlueprintButton>
        <BlueprintButton disabled={isPending} onClick={onClose} type="button" variant="ghost">
          Cancel
        </BlueprintButton>
      </div>
    </form>
  );
}

type DeleteBoardConfirmProps = {
  board: BoardNavItem;
  onClose: () => void;
  onDeleted: () => void;
};

function DeleteBoardConfirm({ board, onClose, onDeleted }: DeleteBoardConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/boards/manage/${board.slug}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message ?? "Unable to delete board.");
        return;
      }

      onDeleted();
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-primary">
        Delete <strong>{board.name}</strong>? All tasks and notes will be permanently removed.
      </p>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <BlueprintButton
          className="flex-1 border-danger bg-danger text-white hover:brightness-105"
          disabled={isPending}
          onClick={handleDelete}
        >
          Delete Board
        </BlueprintButton>
        <BlueprintButton disabled={isPending} onClick={onClose} variant="ghost">
          Cancel
        </BlueprintButton>
      </div>
    </div>
  );
}

type BoardManagementProps = {
  boards: BoardNavItem[];
};

type ModalState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; board: BoardNavItem }
  | { kind: "delete"; board: BoardNavItem };

export function BoardManagement({ boards }: BoardManagementProps) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });

  const refresh = () => {
    setModal({ kind: "closed" });
    router.refresh();
  };

  if (modal.kind === "closed") {
    return (
      <div className="space-y-2">
        <div className="space-y-0.5">
          {boards.map((board) => (
            <div className="group flex items-center gap-1" key={board.slug}>
              <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{board.name}</span>
              <button
                aria-label={`Edit ${board.name}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition hover:text-text-primary group-hover:opacity-100"
                onClick={() => setModal({ kind: "edit", board })}
                type="button"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                aria-label={`Delete ${board.name}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
                onClick={() => setModal({ kind: "delete", board })}
                type="button"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-soft px-3 py-2 text-sm font-semibold text-text-muted transition hover:border-brand hover:text-brand"
          onClick={() => setModal({ kind: "create" })}
          type="button"
        >
          <Plus className="h-4 w-4" />
          New Board
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="blueprint-eyebrow">
          {modal.kind === "create" && "New Board"}
          {modal.kind === "edit" && "Edit Board"}
          {modal.kind === "delete" && "Delete Board"}
        </p>
        <button
          aria-label="Close"
          className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition hover:text-text-primary"
          onClick={() => setModal({ kind: "closed" })}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {modal.kind === "create" && (
        <CreateBoardForm onClose={() => setModal({ kind: "closed" })} onCreated={refresh} />
      )}
      {modal.kind === "edit" && (
        <EditBoardForm
          board={modal.board}
          onClose={() => setModal({ kind: "closed" })}
          onUpdated={refresh}
        />
      )}
      {modal.kind === "delete" && (
        <DeleteBoardConfirm
          board={modal.board}
          onClose={() => setModal({ kind: "closed" })}
          onDeleted={refresh}
        />
      )}
    </div>
  );
}

export function CreateBoardButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-soft px-3 py-2 text-sm font-semibold text-text-muted transition hover:border-brand hover:text-brand"
      onClick={onClick}
      type="button"
    >
      <Plus className="h-4 w-4" />
      New Board
    </button>
  );
}
