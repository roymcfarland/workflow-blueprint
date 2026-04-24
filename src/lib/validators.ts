import { boardStatuses, themePreferences } from "@/lib/domain";
import { z } from "zod";

const subtaskSchema = z.object({
  id: z.string().trim().optional(),
  title: z.string().trim().min(1, "Subtask title is required."),
  isComplete: z.boolean().default(false),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  rememberMe: z.boolean().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "Reset token is required."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Please confirm the password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Task title is required."),
  description: z
    .string()
    .trim()
    .max(1200, "Descriptions should stay under 1200 characters.")
    .nullable()
    .transform((value) => (value ? value : null)),
  status: z.enum(boardStatuses),
  dueDate: z
    .string()
    .trim()
    .nullable()
    .transform((value) => (value ? value : null)),
  subtasks: z.array(subtaskSchema).default([]),
});

export const taskReorderSchema = z.object({
  items: z.array(
    z.object({
      taskId: z.string().trim().min(1),
      status: z.enum(boardStatuses),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

export const noteSchema = z.object({
  content: z
    .string()
    .trim()
    .max(5000, "Notes should stay under 5000 characters."),
});

export const themePreferenceSchema = z.object({
  themePreference: z.enum(themePreferences),
});

export const profileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    email: z.email("Enter a valid email address.").trim().toLowerCase(),
    themePreference: z.enum(themePreferences),
    currentPassword: z.string().trim().optional(),
    newPassword: z.string().trim().optional(),
    confirmPassword: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    const wantsPasswordChange = Boolean(value.newPassword || value.confirmPassword);

    if (!wantsPasswordChange) {
      return;
    }

    if (!value.currentPassword) {
      context.addIssue({
        code: "custom",
        message: "Current password is required to change it.",
        path: ["currentPassword"],
      });
    }

    if (!value.newPassword || value.newPassword.length < 8) {
      context.addIssue({
        code: "custom",
        message: "New password must be at least 8 characters.",
        path: ["newPassword"],
      });
    }

    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "Passwords must match.",
        path: ["confirmPassword"],
      });
    }
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskReorderInput = z.infer<typeof taskReorderSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
