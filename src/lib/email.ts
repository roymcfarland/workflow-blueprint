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
  /* v8 ignore next */
  return value.replace(/[&"'<>]/g, (character) => htmlEntities[character] ?? character);
}

function readEmailConfig(): EmailConfig | null {
  const parsed = emailEnvSchema.safeParse(process.env);

  /* v8 ignore if */
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
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(preview)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f7f9fd;color:#17213a;font-family:'Manrope',ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f9fd;">
      <tr><td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Eyebrow -->
          <tr><td style="padding:0 0 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:40px;height:8px;border-radius:999px;background-color:#d89020;"></td>
              <td style="padding-left:12px;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#1f4fcf;">${siteConfig.name}</td>
            </tr></table>
          </td></tr>
          <!-- Main card -->
          <tr><td style="background-color:#ffffff;border:2px solid #1f4fcf;border-radius:14px;overflow:hidden;">
            <!-- Accent bar -->
            <div style="height:4px;background:linear-gradient(90deg,#1f4fcf 0%,#d89020 100%);"></div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:32px 32px 28px;">
                <h1 style="margin:0 0 20px;font-size:26px;font-weight:800;line-height:1.15;letter-spacing:-0.02em;color:#12348c;">${escapeHtml(heading)}</h1>
                ${body}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                  <tr><td style="background-color:#1f4fcf;border-radius:10px;">
                    <a href="${safeCtaHref}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">${escapeHtml(ctaLabel)}</a>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
          <!-- Footer -->
          <tr><td style="padding:20px 4px 0;">
            <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7b9a;">If the button does not work, open this link: <a href="${safeCtaHref}" style="color:#1f4fcf;text-decoration:underline;">${safeCtaHref}</a></p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid rgba(31,79,207,0.15);"><tr><td style="padding-top:16px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7b9a;">Sent by <span style="font-weight:700;color:#12348c;">${siteConfig.name}</span></p>
            </td></tr></table>
          </td></tr>
        </table>
      </td></tr>
    </table>
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
      body: `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#17213a;">Hi ${safeName},</p>
        <p style="margin:0 0 6px;font-size:16px;line-height:1.7;color:#17213a;">We received a request to reset the password for your account. Use the secure link below to choose a new password.</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7b9a;">This link expires in <strong style="color:#d89020;">24 hours</strong>. If you did not request this, you can safely ignore this email.</p>`,
      ctaHref: resetUrl,
      ctaLabel: "Reset Password",
      heading: "Reset your password",
      preview: "Reset your Workflow Blueprint password",
    }),
    subject: "Reset your Workflow Blueprint password",
    text: `Hi ${name},

We received a request to reset the password for your account.

Use this secure link to choose a new password:
${resetUrl}

This link expires in 24 hours. If you did not request it, you can safely ignore this email.`,
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
      body: `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#17213a;">You have been invited to join <strong style="color:#12348c;">Workflow Blueprint</strong>.</p>
        <p style="margin:0 0 6px;font-size:16px;line-height:1.7;color:#17213a;">Accept the invitation below to create your account and start planning.</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7b9a;">This invitation expires in <strong style="color:#d89020;">7 days</strong>.</p>`,
      ctaHref: inviteUrl,
      ctaLabel: "Accept Invitation",
      heading: "You\u2019re invited",
      preview: "You\u2019re invited to Workflow Blueprint",
    }),
    subject: "Your Workflow Blueprint invitation",
    text: `You have been invited to join Workflow Blueprint.

Accept the invitation to create your account and start planning:
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
      body: `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#17213a;">Hi ${safeName},</p>
        <p style="margin:0 0 6px;font-size:16px;line-height:1.7;color:#17213a;">Your account is ready. Open your dashboard to start creating boards, organizing tasks, and shipping meaningful work.</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7b9a;">Plan. Execute. Achieve.</p>`,
      ctaHref: dashboardUrl,
      ctaLabel: "Open Dashboard",
      heading: "Welcome to Workflow Blueprint",
      preview: "Your Workflow Blueprint account is ready",
    }),
    subject: "Welcome to Workflow Blueprint",
    text: `Hi ${name},

Your Workflow Blueprint account is ready. Open your dashboard to start creating boards, organizing tasks, and shipping meaningful work:
${dashboardUrl}

Plan. Execute. Achieve.`,
    to,
  });
}
