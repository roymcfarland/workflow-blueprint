"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { BlueprintPillToggle } from "@/components/blueprint/pill-toggle";
import type { ThemePreference } from "@/lib/domain";
import type { ProfileInput } from "@/lib/validators";

const themeOptions = [
  { label: "Day", value: "day" },
  { label: "Night", value: "night" },
  { label: "Device", value: "system" },
] as const;

type ProfileFormProps = {
  user: {
    email: string;
    name: string;
    themePreference: ThemePreference;
  };
};

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(user.themePreference);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
    setValue,
  } = useForm<ProfileInput>({
    defaultValues: {
      name: user.name,
      email: user.email,
      themePreference: user.themePreference,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(body.message ?? "Unable to save profile.");
        return;
      }

      setMessage("Profile saved");
      router.refresh();
    });
  });

  return (
    <form className="space-y-8" onSubmit={onSubmit}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Name
          </label>
          <BlueprintInput {...register("name")} />
          {errors.name ? <p className="text-sm text-rose-600">{errors.name.message}</p> : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Email
          </label>
          <BlueprintInput {...register("email")} />
          {errors.email ? <p className="text-sm text-rose-600">{errors.email.message}</p> : null}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Theme preference
        </label>
        <BlueprintPillToggle
          onChange={(value) => {
            setThemePreference(value);
            setValue("themePreference", value);
          }}
          options={themeOptions}
          value={themePreference}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-2">
          <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Current password
          </label>
          <BlueprintInput type="password" {...register("currentPassword")} />
          {errors.currentPassword ? (
            <p className="text-sm text-rose-600">{errors.currentPassword.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
            New password
          </label>
          <BlueprintInput type="password" {...register("newPassword")} />
          {errors.newPassword ? (
            <p className="text-sm text-rose-600">{errors.newPassword.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Confirm password
          </label>
          <BlueprintInput type="password" {...register("confirmPassword")} />
          {errors.confirmPassword ? (
            <p className="text-sm text-rose-600">{errors.confirmPassword.message}</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-[1.3rem] border-2 border-ink-soft bg-white/70 p-4 text-sm text-ink-muted dark:bg-paper-strong">
        <p className="font-semibold text-ink">Demo environment note</p>
        <p>
          This build uses a local SQLite database with a seeded demo account, so profile changes and
          theme preferences persist between sessions on this machine.
        </p>
      </div>

      {message ? (
        <p className="rounded-[1.2rem] border-2 border-ink-soft bg-white/75 px-4 py-3 text-sm font-semibold text-ink dark:bg-paper-strong">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <BlueprintButton disabled={isPending} type="submit">
          {isPending ? "Saving..." : "Save Profile"}
        </BlueprintButton>
      </div>
    </form>
  );
}
