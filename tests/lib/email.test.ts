import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: vi.fn(function ResendMock() {
    return {
      emails: { send: sendMock },
    };
  }),
}));

import {
  buildAppUrl,
  EmailConfigurationError,
  EmailDeliveryError,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "@/lib/email";
import { siteConfig } from "@/lib/site-config";

beforeEach(() => {
  sendMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildAppUrl", () => {
  test("resolves a path against the configured site URL", () => {
    expect(buildAppUrl("/dashboard")).toBe(new URL("/dashboard", siteConfig.url).toString());
  });
});

describe("sendPasswordResetEmail", () => {
  test("skips sending when Resend is not configured outside production", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    const result = await sendPasswordResetEmail({
      name: "Alex",
      resetUrl: "https://app.test/reset?token=abc",
      to: "alex@example.test",
    });

    expect(result).toEqual({ status: "skipped", reason: "missing-config" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("sends the email and escapes the name and link when configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    sendMock.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });

    const result = await sendPasswordResetEmail({
      name: "A & B",
      resetUrl: "https://app.test/reset?token=abc&x=1",
      to: "alex@example.test",
    });

    expect(result).toEqual({ status: "sent", id: "email_123" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe("alex@example.test");
    expect(payload.from).toBe("noreply@example.test");
    expect(payload.html).toContain("A &amp; B");
    expect(payload.html).toContain("abc&amp;x=1");
  });

  test("throws EmailConfigurationError when Resend is not configured in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    await expect(
      sendPasswordResetEmail({
        name: "Alex",
        resetUrl: "https://app.test/reset",
        to: "alex@example.test",
      }),
    ).rejects.toBeInstanceOf(EmailConfigurationError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("throws EmailDeliveryError when Resend returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "Resend is down" } });

    await expect(
      sendPasswordResetEmail({
        name: "Alex",
        resetUrl: "https://app.test/reset",
        to: "alex@example.test",
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});

describe("sendInviteEmail", () => {
  test("sends with the invite subject and link", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    sendMock.mockResolvedValueOnce({ data: { id: "email_456" }, error: null });

    const result = await sendInviteEmail({
      inviteUrl: "https://app.test/sign-up?invite=xyz",
      to: "new@example.test",
    });

    expect(result).toEqual({ status: "sent", id: "email_456" });
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      to: "new@example.test",
      subject: "Your Workflow Blueprint invitation",
    });
  });
});

describe("sendWelcomeEmail", () => {
  test("defaults dashboardUrl to buildAppUrl('/dashboard')", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    sendMock.mockResolvedValueOnce({ data: { id: "email_789" }, error: null });

    await sendWelcomeEmail({ name: "Alex", to: "alex@example.test" });

    expect(sendMock.mock.calls[0][0].html).toContain(buildAppUrl("/dashboard"));
  });

  test("uses an explicit dashboardUrl when provided", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    sendMock.mockResolvedValueOnce({ data: { id: "email_000" }, error: null });

    await sendWelcomeEmail({
      dashboardUrl: "https://custom.test/dashboard",
      name: "Alex",
      to: "alex@example.test",
    });

    expect(sendMock.mock.calls[0][0].html).toContain("https://custom.test/dashboard");
  });
});
