"use client";

import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { Field } from "@/components/blueprint/field";
import type { SignUpInput } from "@/lib/validators";

type SignUpFormProps = {
  expiresAt: string;
  inviteToken: string;
  invitedEmail: string;
};

export function SignUpForm({ expiresAt, inviteToken, invitedEmail }: SignUpFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const expiresLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(expiresAt));
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<SignUpInput>({
    defaultValues: {
      confirmPassword: "",
      email: invitedEmail,
      inviteToken,
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
    <form className="space-y-5" onSubmit={onSubmit}>
      <input type="hidden" {...register("inviteToken")} />

      <div className="blueprint-panel-muted rounded-lg px-4 py-3 text-sm">
        <p className="font-semibold text-text-primary">Invitation for {invitedEmail}</p>
        <p>This invite expires on {expiresLabel}.</p>
      </div>

      <Field error={errors.name?.message} htmlFor="name" label="Name">
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <BlueprintInput
            aria-invalid={errors.name ? "true" : "false"}
            autoComplete="name"
            className="pl-12"
            id="name"
            placeholder="Your name"
            {...register("name", {
              required: "Name is required.",
            })}
          />
        </div>
      </Field>

      <Field error={errors.email?.message} htmlFor="email" label="Email">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <BlueprintInput
            aria-invalid={errors.email ? "true" : "false"}
            autoComplete="email"
            className="pl-12"
            id="email"
            placeholder="you@company.com"
            readOnly
            type="email"
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
            autoComplete="new-password"
            className="pl-12 pr-12"
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
            autoComplete="new-password"
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

      <BlueprintButton className="w-full text-base" disabled={isPending} type="submit" variant="hero">
        {isPending ? "Creating account…" : "Create account"}
      </BlueprintButton>

      <div className="text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link
          className="font-semibold text-brand underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          href="/"
        >
          Sign in
        </Link>
      </div>
    </form>
  );
}
