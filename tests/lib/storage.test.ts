import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createSignedUploadUrlMock = vi.hoisted(() => vi.fn());
const createSignedUrlMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() =>
  vi.fn(() => ({
    createSignedUploadUrl: createSignedUploadUrlMock,
    createSignedUrl: createSignedUrlMock,
    remove: removeMock,
  })),
);

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: { from: fromMock },
  })),
}));

import { createSignedDownloadUrl, createSignedUploadUrl, removeStorageObject } from "@/lib/storage";

beforeEach(() => {
  createSignedUploadUrlMock.mockReset();
  createSignedUrlMock.mockReset();
  removeMock.mockReset();
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createSignedUploadUrl", () => {
  test("returns the signed upload URL, token, and path", async () => {
    createSignedUploadUrlMock.mockResolvedValueOnce({
      data: {
        signedUrl: "https://storage.test/upload",
        token: "tok_123",
        path: "attachments/a.pdf",
      },
      error: null,
    });

    const result = await createSignedUploadUrl("attachments/a.pdf");

    expect(result).toEqual({
      uploadUrl: "https://storage.test/upload",
      token: "tok_123",
      path: "attachments/a.pdf",
    });
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith("attachments/a.pdf");
  });

  test("throws when Supabase returns an error", async () => {
    createSignedUploadUrlMock.mockResolvedValueOnce({
      data: null,
      error: { message: "quota exceeded" },
    });

    await expect(createSignedUploadUrl("attachments/a.pdf")).rejects.toThrow("quota exceeded");
  });
});

describe("createSignedDownloadUrl", () => {
  test("returns the signed download URL", async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: { signedUrl: "https://storage.test/download" },
      error: null,
    });

    const result = await createSignedDownloadUrl("attachments/a.pdf");

    expect(result).toBe("https://storage.test/download");
    expect(createSignedUrlMock).toHaveBeenCalledWith("attachments/a.pdf", 60);
  });

  test("throws when Supabase returns an error", async () => {
    createSignedUrlMock.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await expect(createSignedDownloadUrl("attachments/a.pdf")).rejects.toThrow("not found");
  });
});

describe("removeStorageObject", () => {
  test("resolves when Supabase removes the object", async () => {
    removeMock.mockResolvedValueOnce({ error: null });

    await expect(removeStorageObject("attachments/a.pdf")).resolves.toBeUndefined();
    expect(removeMock).toHaveBeenCalledWith(["attachments/a.pdf"]);
  });

  test("throws when Supabase returns an error", async () => {
    removeMock.mockResolvedValueOnce({ error: { message: "not found" } });

    await expect(removeStorageObject("attachments/a.pdf")).rejects.toThrow("not found");
  });
});

describe("storage configuration guard", () => {
  test("throws when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    await expect(createSignedDownloadUrl("attachments/a.pdf")).rejects.toThrow(
      "Supabase storage is not configured.",
    );
  });
});
