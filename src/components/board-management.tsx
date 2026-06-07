"use client";

import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { BoardIcon } from "@/components/board-icon";
import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { availableBoardIcons, boardAccentPalette } from "@/lib/domain";
import { cn } from "@/lib/utils";

type CreateBoardFormProps = {
  onClose: () => void;
  onCreated: () => void;
};

function CreateBoardForm({ onClose, onCreated }: CreateBoardFormProps) {
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("briefcase");
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/boards/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, iconKey, ...(accentColor ? { accentColor } : {}) }),
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
          Create
        </BlueprintButton>
        <BlueprintButton disabled={isPending} onClick={onClose} type="button" variant="ghost">
          Cancel
        </BlueprintButton>
      </div>
    </form>
  );
}

type ModalState = { kind: "closed" } | { kind: "create" };

export function BoardManagement() {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });

  const refresh = () => {
    setModal({ kind: "closed" });
    router.refresh();
  };

  if (modal.kind === "closed") {
    return (
      <button
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-soft px-3 py-2 text-sm font-semibold text-text-muted transition hover:border-brand hover:text-brand"
        onClick={() => setModal({ kind: "create" })}
        type="button"
      >
        <Plus className="h-4 w-4" />
        New Board
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="blueprint-eyebrow">New Board</p>
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
