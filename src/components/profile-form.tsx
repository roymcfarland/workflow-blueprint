"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintInput } from "@/components/blueprint/input";
import { BlueprintPillToggle } from "@/components/blueprint/pill-toggle";
import { Field } from "@/components/blueprint/field";
import { SaveIndicator, type SaveStatus } from "@/components/blueprint/save-indicator";
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
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
    setSaveStatus("saving");
    setSaveMessage(null);

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
        setSaveStatus("error");
        setSaveMessage(body.message ?? "Unable to save profile.");
        return;
      }

      setSaveStatus("saved");
      setSaveMessage(null);
      router.refresh();
      setTimeout(() => setSaveStatus("idle"), 1800);
    });
  });

  return (
    <form className="space-y-7" onSubmit={onSubmit}>
      <div className="auto-fit-grid gap-4 [--auto-fit-min:16rem]">
        <Field error={errors.name?.message} label="Name">
          <BlueprintInput {...register("name")} />
        </Field>

        <Field error={errors.email?.message} label="Email">
          <BlueprintInput {...register("email")} />
        </Field>
      </div>

      <Field label="Theme preference">
        <BlueprintPillToggle
          onChange={(value) => {
            setThemePreference(value);
            setValue("themePreference", value);
          }}
          options={themeOptions}
          value={themePreference}
        />
      </Field>

      <div className="space-y-3">
        <p className="blueprint-eyebrow">Change password</p>
        <div className="auto-fit-grid gap-4 [--auto-fit-min:14rem]">
          <Field error={errors.currentPassword?.message} label="Current password">
            <BlueprintInput type="password" {...register("currentPassword")} />
          </Field>

          <Field error={errors.newPassword?.message} label="New password">
            <BlueprintInput type="password" {...register("newPassword")} />
          </Field>

          <Field error={errors.confirmPassword?.message} label="Confirm password">
            <BlueprintInput type="password" {...register("confirmPassword")} />
          </Field>
        </div>
      </div>

      <div className="blueprint-panel-muted rounded-lg p-4 text-sm">
        <p className="font-semibold text-text-primary">Account settings</p>
        <p>
          Profile changes, passwords, and theme preferences are saved to the configured Postgres
          database.
        </p>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SaveIndicator message={saveMessage} status={saveStatus} />
        <BlueprintButton disabled={isPending} type="submit">
          {isPending ? "Saving…" : "Save profile"}
        </BlueprintButton>
      </div>
    </form>
  );
}
