import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getShellSnapshot: vi.fn(),
}));

import { metadata } from "@/app/(app)/layout";

describe("ProtectedLayout metadata", () => {
  test("is marked noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
