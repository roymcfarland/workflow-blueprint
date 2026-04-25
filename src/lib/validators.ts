import { boardStatuses, themePreferences } from "@/lib/domain";
import { z } from "zod";

function isValidDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, yearPart, monthPart, dayPart] = match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const subtaskSchema = z.object({
  id: z.string().trim().optional(),
  title: z
    .string()
    .trim()
    .min(1, "Subtask title is required.")
    .max(180, "Subtask titles should stay under 180 characters."),
  isComplete: z.boolean().default(false),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  rememberMe: z.boolean().default(false),
});

export const signUpSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(80, "Name should stay under 80 characters."),
    email: z.email("Enter a valid email address.").trim().toLowerCase(),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Please confirm the password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
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

export const taskInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Task title is required.")
      .max(180, "Task titles should stay under 180 characters."),
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
      .transform((value) => (value ? value : null))
      .refine((value) => value === null || isValidDateOnly(value), {
        message: "Enter a valid due date.",
      }),
    subtasks: z.array(subtaskSchema).max(50, "Tasks can include up to 50 subtasks.").default([]),
  })
  .superRefine((value, context) => {
    const subtaskIds = new Set<string>();

    value.subtasks.forEach((subtask, index) => {
      if (!subtask.id || !subtaskIds.has(subtask.id)) {
        if (subtask.id) {
          subtaskIds.add(subtask.id);
        }

        return;
      }

      context.addIssue({
        code: "custom",
        message: "Task payload contains duplicate subtasks.",
        path: ["subtasks", index, "id"],
      });
    });
  });

export const taskReorderSchema = z
  .object({
    items: z.array(
      z.object({
        taskId: z.string().trim().min(1),
        status: z.enum(boardStatuses),
        sortOrder: z.number().int().min(0),
      }),
    ),
  })
  .superRefine((value, context) => {
    const taskIds = new Set<string>();

    value.items.forEach((item, index) => {
      if (!taskIds.has(item.taskId)) {
        taskIds.add(item.taskId);
        return;
      }

      context.addIssue({
        code: "custom",
        message: "Task reorder payload contains duplicate tasks.",
        path: ["items", index, "taskId"],
      });
    });
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
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(80, "Name should stay under 80 characters."),
    email: z.email("Enter a valid email address.").trim().toLowerCase(),
    themePreference: z.enum(themePreferences),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
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
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskReorderInput = z.infer<typeof taskReorderSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
