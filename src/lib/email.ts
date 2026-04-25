import { Resend } from "resend";
import { z } from "zod";

import { siteConfig } from "@/lib/site-config";

type EmailPayload = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

type EmailDeliveryResult =
  | {
      id?: string;
      status: "sent";
    }
  | {
      reason: "missing-config";
      status: "skipped";
    };

type EmailConfig = {
  apiKey: string;
  from: string;
};

const optionalEnvString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  },
  z.string().optional(),
);

const emailEnvSchema = z.object({
  EMAIL_FROM: optionalEnvString,
  RESEND_API_KEY: optionalEnvString,
});

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "'": "&#39;",
  "<": "&lt;",
  ">": "&gt;",
};

let resendClient: Resend | null = null;

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  originalError: unknown;

  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = "EmailDeliveryError";
    this.originalError = originalError;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&"'<>]/g, (character) => htmlEntities[character] ?? character);
}

function readEmailConfig(): EmailConfig | null {
  const parsed = emailEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new EmailConfigurationError("Email environment variables are invalid.");
  }

  const { EMAIL_FROM: from, RESEND_API_KEY: apiKey } = parsed.data;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailConfigurationError("RESEND_API_KEY and EMAIL_FROM must be configured.");
    }

    return null;
  }

  return {
    apiKey,
    from,
  };
}

function getResendClient(apiKey: string) {
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

function emailShell({
  body,
  ctaHref,
  ctaLabel,
  heading,
  preview,
}: {
  body: string;
  ctaHref: string;
  ctaLabel: string;
  heading: string;
  preview: string;
}) {
  const safeCtaHref = escapeHtml(ctaHref);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(preview)}</title>
  </head>
  <body style="margin:0;background:#f4f0e8;color:#1f2937;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
    <main style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <section style="background:#fffaf0;border:1px solid #1f2937;border-radius:8px;padding:28px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4f78e6;">${siteConfig.name}</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.15;color:#1f2937;">${escapeHtml(heading)}</h1>
        ${body}
        <p style="margin:28px 0 0;">
          <a href="${safeCtaHref}" style="display:inline-block;background:#1f4fcf;color:#fff;text-decoration:none;border:1px solid #1f2937;border-radius:8px;padding:12px 18px;font-weight:700;">${escapeHtml(ctaLabel)}</a>
        </p>
      </section>
      <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
        If the button does not work, open this link: <a href="${safeCtaHref}" style="color:#1f4fcf;">${safeCtaHref}</a>
      </p>
    </main>
  </body>
</html>`;
}

async function sendTransactionalEmail(payload: EmailPayload): Promise<EmailDeliveryResult> {
  const config = readEmailConfig();

  if (!config) {
    return {
      reason: "missing-config",
      status: "skipped",
    };
  }

  const { data, error } = await getResendClient(config.apiKey).emails.send({
    from: config.from,
    html: payload.html,
    subject: payload.subject,
    text: payload.text,
    to: payload.to,
  });

  if (error) {
    throw new EmailDeliveryError("Resend was unable to send the email.", error);
  }

  return {
    id: data?.id,
    status: "sent",
  };
}

export function buildAppUrl(path: string) {
  return new URL(path, siteConfig.url).toString();
}

export async function sendPasswordResetEmail({
  name,
  resetUrl,
  to,
}: {
  name: string;
  resetUrl: string;
  to: string;
}) {
  const safeName = escapeHtml(name);

  return sendTransactionalEmail({
    html: emailShell({
      body: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hi ${safeName},</p>
        <p style="margin:0;font-size:16px;line-height:1.6;">Use the secure link below to choose a new password for your Workflow Blueprint account. This link expires in 24 hours.</p>`,
      ctaHref: resetUrl,
      ctaLabel: "Reset Password",
      heading: "Reset your password",
      preview: "Reset your Workflow Blueprint password",
    }),
    subject: "Reset your Workflow Blueprint password",
    text: `Hi ${name},

Use this secure link to choose a new password for your Workflow Blueprint account:
${resetUrl}

This link expires in 24 hours. If you did not request it, you can ignore this email.`,
    to,
  });
}

export async function sendInviteEmail({
  inviteUrl,
  to,
}: {
  inviteUrl: string;
  to: string;
}) {
  return sendTransactionalEmail({
    html: emailShell({
      body: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">You have been invited to Workflow Blueprint.</p>
        <p style="margin:0;font-size:16px;line-height:1.6;">Use the secure link below to create your account. This invitation expires in 7 days.</p>`,
      ctaHref: inviteUrl,
      ctaLabel: "Accept Invitation",
      heading: "You are invited",
      preview: "Create your Workflow Blueprint account",
    }),
    subject: "Your Workflow Blueprint invitation",
    text: `You have been invited to Workflow Blueprint.

Use this secure link to create your account:
${inviteUrl}

This invitation expires in 7 days.`,
    to,
  });
}

export async function sendWelcomeEmail({
  dashboardUrl = buildAppUrl("/dashboard"),
  name,
  to,
}: {
  dashboardUrl?: string;
  name: string;
  to: string;
}) {
  const safeName = escapeHtml(name);

  return sendTransactionalEmail({
    html: emailShell({
      body: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hi ${safeName},</p>
        <p style="margin:0;font-size:16px;line-height:1.6;">Your account is ready. Open your dashboard to start shaping your boards and tasks.</p>`,
      ctaHref: dashboardUrl,
      ctaLabel: "Open Dashboard",
      heading: "Welcome to Workflow Blueprint",
      preview: "Your Workflow Blueprint account is ready",
    }),
    subject: "Welcome to Workflow Blueprint",
    text: `Hi ${name},

Your Workflow Blueprint account is ready. Open your dashboard:
${dashboardUrl}`,
    to,
  });
}
