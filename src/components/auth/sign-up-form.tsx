"use client";

import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import type { SignUpInput } from "@/lib/validators";

export function SignUpForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<SignUpInput>({
    defaultValues: {
      confirmPassword: "",
      email: "",
      name: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/sign-up", {
        body: JSON.stringify(values),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(body.message ?? "Unable to create account.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label className="block text-base font-semibold text-ink" htmlFor="name">
          Name
        </label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <BlueprintInput
            aria-invalid={errors.name ? "true" : "false"}
            autoComplete="name"
            className="pl-14"
            id="name"
            placeholder="Your name"
            {...register("name", {
              required: "Name is required.",
            })}
          />
        </div>
        {errors.name ? <p className="text-sm text-rose-600">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-2">
        <label className="block text-base font-semibold text-ink" htmlFor="email">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <BlueprintInput
            aria-invalid={errors.email ? "true" : "false"}
            autoComplete="email"
            className="pl-14"
            id="email"
            placeholder="you@company.com"
            type="email"
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
            autoComplete="new-password"
            className="pl-14 pr-14"
            id="password"
            placeholder="At least 8 characters"
            type={showPassword ? "text" : "password"}
            {...register("password", {
              minLength: {
                message: "Password must be at least 8 characters.",
                value: 8,
              },
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

      <div className="space-y-2">
        <label className="block text-base font-semibold text-ink" htmlFor="confirmPassword">
          Confirm password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <BlueprintInput
            aria-invalid={errors.confirmPassword ? "true" : "false"}
            autoComplete="new-password"
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
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
        {errors.confirmPassword ? (
          <p className="text-sm text-rose-600">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </p>
      ) : null}

      <BlueprintButton className="w-full text-base" disabled={isPending} type="submit">
        {isPending ? "Creating Account..." : "Create Account"}
      </BlueprintButton>

      <div className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link className="font-semibold text-ink underline decoration-2 underline-offset-4" href="/">
          Sign in
        </Link>
      </div>
    </form>
  );
}
