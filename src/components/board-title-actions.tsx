"use client";

import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { useToast } from "@/components/providers/toast-provider";
import { availableBoardIcons, boardAccentPalette } from "@/lib/domain";
import { cn } from "@/lib/utils";

type BoardSummary = {
  accentColor?: string | null;
  iconKey: string;
  name: string;
  slug: string;
};

type ModalState = { kind: "closed" } | { kind: "edit" } | { kind: "delete" };

export function BoardTitleActions({ board }: { board: BoardSummary }) {
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });

  useEffect(() => {
    if (modal.kind === "closed") {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal({ kind: "closed" });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.kind]);

  const handleClose = () => setModal({ kind: "closed" });

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          aria-label={`Edit ${board.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-text-primary transition hover:bg-surface-control-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          onClick={() => setModal({ kind: "edit" })}
          type="button"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          aria-label={`Delete ${board.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface-control text-text-primary transition hover:border-danger/40 hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          onClick={() => setModal({ kind: "delete" })}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {modal.kind === "edit" ? (
        <BoardModal label={`Edit ${board.name}`} onClose={handleClose} title="Edit board">
          <EditBoardModalContent board={board} onClose={handleClose} />
        </BoardModal>
      ) : null}

      {modal.kind === "delete" ? (
        <BoardModal label={`Delete ${board.name}`} onClose={handleClose} title="Delete board">
          <DeleteBoardModalContent board={board} onClose={handleClose} />
        </BoardModal>
      ) : null}
    </>
  );
}

function BoardModal({
  children,
  label,
  onClose,
  title,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        aria-label={label}
        aria-modal="true"
        className="blueprint-surface blueprint-surface-strong w-full max-w-md space-y-4 rounded-xl p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            aria-label="Close"
            className="blueprint-action shrink-0 rounded-md p-1 text-text-muted"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditBoardModalContent({
  board,
  onClose,
}: {
  board: BoardSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(board.name);
  const [iconKey, setIconKey] = useState(board.iconKey);
  const [accentColor, setAccentColor] = useState<string | null>(board.accentColor ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/boards/manage/${board.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, iconKey, ...(accentColor ? { accentColor } : {}) }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Unable to update board.");
        return;
      }

      const updatedSlug = data.board?.slug ?? board.slug;
      showToast("Board updated.");
      onClose();
      if (updatedSlug !== board.slug) {
        router.push(`/boards/${updatedSlug}`);
      } else {
        router.refresh();
      }
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
      <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1">
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
      <div className="flex flex-wrap gap-1.5">
        {boardAccentPalette.map((color) => (
          <button
            aria-label={`Accent color ${color}`}
            aria-pressed={accentColor === color}
            className={cn(
              "h-7 w-7 rounded-full border-2 transition",
              accentColor === color
                ? "border-text-primary"
                : "border-transparent hover:border-line-strong",
            )}
            key={color}
            onClick={() => setAccentColor(color)}
            style={{ backgroundColor: color }}
            title={color}
            type="button"
          />
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

function DeleteBoardModalContent({
  board,
  onClose,
}: {
  board: BoardSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
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

      showToast("Board deleted.");
      onClose();
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-primary">
        Delete <strong>{board.name}</strong>? All tasks and notes will be permanently removed. This
        cannot be undone.
      </p>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <BlueprintButton
          className="flex-1 border-danger bg-danger text-white hover:brightness-105"
          disabled={isPending}
          onClick={handleDelete}
          type="button"
        >
          Delete Board
        </BlueprintButton>
        <BlueprintButton disabled={isPending} onClick={onClose} type="button" variant="ghost">
          Cancel
        </BlueprintButton>
      </div>
    </div>
  );
}
