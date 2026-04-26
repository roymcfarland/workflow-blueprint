"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { Field } from "@/components/blueprint/field";
import type { ResetPasswordInput } from "@/lib/validators";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    register,
    handleSubmit,
  } = useForm<ResetPasswordInput>({
    defaultValues: {
      token,
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(body.message ?? "Unable to reset the password.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  });

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <input type="hidden" {...register("token")} />

      <Field error={errors.password?.message} htmlFor="password" label="New password">
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <BlueprintInput
            aria-invalid={errors.password ? "true" : "false"}
            className="pl-12 pr-12"
            id="password"
            type={showPassword ? "text" : "password"}
            {...register("password", {
              required: "Password is required.",
            })}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </Field>

      <Field
        error={errors.confirmPassword?.message}
        htmlFor="confirmPassword"
        label="Confirm password"
      >
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <BlueprintInput
            aria-invalid={errors.confirmPassword ? "true" : "false"}
            className="pl-12 pr-12"
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            {...register("confirmPassword", {
              required: "Please confirm the password.",
            })}
          />
          <button
            aria-label={
              showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            onClick={() => setShowConfirmPassword((value) => !value)}
            type="button"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
      </Field>

      {message ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {message}
        </p>
      ) : null}

      <BlueprintButton className="w-full" disabled={isPending} type="submit" variant="hero">
        {isPending ? "Updating…" : "Set new password"}
      </BlueprintButton>
    </form>
  );
}
