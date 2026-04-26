"use client";

import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintCheckbox } from "@/components/blueprint/checkbox";
import { BlueprintInput } from "@/components/blueprint/input";
import { Field } from "@/components/blueprint/field";
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
    <form className="space-y-5" onSubmit={onSubmit}>
      <Field error={errors.email?.message} htmlFor="email" label="Email">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <BlueprintInput
            aria-invalid={errors.email ? "true" : "false"}
            className="pl-12"
            id="email"
            placeholder="you@company.com"
            {...register("email", {
              required: "Email is required.",
            })}
          />
        </div>
      </Field>

      <Field error={errors.password?.message} htmlFor="password" label="Password">
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <BlueprintInput
            aria-invalid={errors.password ? "true" : "false"}
            className="pl-12 pr-12"
            id="password"
            placeholder="••••••••"
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

      <BlueprintCheckbox label="Remember me" {...register("rememberMe")} />

      {message ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {message}
        </p>
      ) : null}

      <BlueprintButton className="w-full text-base" disabled={isPending} type="submit" variant="hero">
        {isPending ? "Signing in…" : "Sign in"}
      </BlueprintButton>

      <div className="text-center">
        <Link
          className="text-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href="/forgot-password"
        >
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}
