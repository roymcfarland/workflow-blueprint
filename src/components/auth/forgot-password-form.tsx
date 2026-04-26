"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import type { ForgotPasswordInput } from "@/lib/validators";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    register,
    handleSubmit,
  } = useForm<ForgotPasswordInput>({
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setPreviewLink(null);
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as { message?: string; previewLink?: string };

      setMessage(body.message ?? "If that account exists, a reset link has been prepared.");
      setPreviewLink(body.previewLink ?? null);
    });
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label className="block text-base font-semibold text-text-primary" htmlFor="email">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <BlueprintInput
            aria-invalid={errors.email ? "true" : "false"}
            className="pl-14"
            id="email"
            placeholder="you@company.com"
            {...register("email", {
              required: "Email is required.",
            })}
          />
        </div>
        {errors.email ? <p className="text-sm text-rose-600">{errors.email.message}</p> : null}
      </div>

      {message ? (
        <div className="blueprint-panel-muted space-y-3 rounded-lg px-4 py-3 text-sm text-text-primary">
          <p>{message}</p>
          {previewLink ? (
            <Link
              className="font-semibold underline decoration-2 underline-offset-4"
              href={previewLink}
            >
              Open preview reset link
            </Link>
          ) : null}
        </div>
      ) : null}

      <BlueprintButton className="w-full" disabled={isPending} type="submit">
        {isPending ? "Preparing..." : "Prepare Reset Link"}
      </BlueprintButton>

      <div className="text-center text-sm text-text-muted">
        <Link className="font-semibold text-brand underline decoration-2 underline-offset-4" href="/">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
