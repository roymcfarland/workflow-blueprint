"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
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
    <form className="space-y-6" onSubmit={onSubmit}>
      <input type="hidden" {...register("token")} />

      <div className="space-y-2">
        <label className="block text-lg font-semibold text-ink" htmlFor="password">
          New password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-ink-muted" />
          <BlueprintInput
            aria-invalid={errors.password ? "true" : "false"}
            className="pl-14 pr-14"
            id="password"
            type={showPassword ? "text" : "password"}
            {...register("password", {
              required: "Password is required.",
            })}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
          </button>
        </div>
        {errors.password ? (
          <p className="text-sm text-rose-600">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-lg font-semibold text-ink" htmlFor="confirmPassword">
          Confirm password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-ink-muted" />
          <BlueprintInput
            aria-invalid={errors.confirmPassword ? "true" : "false"}
            className="pl-14 pr-14"
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
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted"
            onClick={() => setShowConfirmPassword((value) => !value)}
            type="button"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-6 w-6" />
            ) : (
              <Eye className="h-6 w-6" />
            )}
          </button>
        </div>
        {errors.confirmPassword ? (
          <p className="text-sm text-rose-600">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-[1.3rem] border-2 border-rose-500/30 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </p>
      ) : null}

      <BlueprintButton className="w-full" disabled={isPending} type="submit">
        {isPending ? "Updating..." : "Set New Password"}
      </BlueprintButton>
    </form>
  );
}
