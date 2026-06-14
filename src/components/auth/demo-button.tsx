"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BlueprintButton } from "@/components/blueprint/button";

export function DemoButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const startDemo = () => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const body = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setMessage(body.message ?? "Unable to start the demo. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {message ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {message}
        </p>
      ) : null}
      <BlueprintButton
        className="w-full text-base"
        disabled={isPending}
        onClick={startDemo}
        type="button"
        variant="outline"
      >
        {isPending ? "Starting demo…" : "View live demo"}
      </BlueprintButton>
    </div>
  );
}
