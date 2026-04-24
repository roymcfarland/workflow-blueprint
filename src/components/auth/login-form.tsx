"use client";

import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintCheckbox } from "@/components/blueprint/checkbox";
import { BlueprintInput } from "@/components/blueprint/input";
import type { SignInInput } from "@/lib/validators";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors },
    register,
    handleSubmit,
  } = useForm<SignInInput>({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true,
    },
  });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(body.message ?? "Unable to sign in.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label className="block text-base font-semibold text-ink" htmlFor="email">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
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

      <div className="space-y-2">
        <label className="block text-base font-semibold text-ink" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <BlueprintInput
            aria-invalid={errors.password ? "true" : "false"}
            className="pl-14 pr-14"
            id="password"
            placeholder="••••••••"
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
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {errors.password ? (
          <p className="text-sm text-rose-600">{errors.password.message}</p>
        ) : null}
      </div>

      <BlueprintCheckbox label="Remember me" {...register("rememberMe")} />

      {message ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </p>
      ) : null}

      <BlueprintButton className="w-full text-base" disabled={isPending} type="submit">
        {isPending ? "Signing In..." : "Sign In"}
      </BlueprintButton>

      <div className="flex items-center gap-4 text-ink-muted">
        <div className="h-px flex-1 bg-ink-soft" />
        <span className="text-sm font-semibold uppercase tracking-[0.14em]">or</span>
        <div className="h-px flex-1 bg-ink-soft" />
      </div>

      <div className="space-y-4 text-center">
        <Link
          className="text-base font-semibold underline decoration-2 underline-offset-4"
          href="/forgot-password"
        >
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}
