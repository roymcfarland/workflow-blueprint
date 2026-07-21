// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const apiTokensAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireCurrentAdmin: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listApiTokens: vi.fn(),
}));

vi.mock("@/components/admin/api-tokens-admin", () => ({
  ApiTokensAdmin: (props: Record<string, unknown>) => {
    apiTokensAdminMock(props);

    return <div data-testid="api-tokens-admin" />;
  },
}));

import AdminApiTokensPage from "@/app/(app)/admin/api-tokens/page";
import { requireCurrentAdmin } from "@/lib/auth";
import { listApiTokens } from "@/lib/data";

beforeEach(() => {
  apiTokensAdminMock.mockReset();
  vi.mocked(requireCurrentAdmin).mockReset();
  vi.mocked(listApiTokens).mockReset();
  vi.mocked(requireCurrentAdmin).mockResolvedValue({ id: "admin-1" } as never);
});

afterEach(() => {
  cleanup();
});

describe("AdminApiTokensPage", () => {
  test("renders ApiTokensAdmin with the fetched tokens", async () => {
    const apiTokens = [{ id: "token-1" }] as never;
    vi.mocked(listApiTokens).mockResolvedValueOnce(apiTokens);

    render(await AdminApiTokensPage());

    expect(screen.getByTestId("api-tokens-admin")).toBeDefined();
    expect(requireCurrentAdmin).toHaveBeenCalledTimes(1);
    expect(listApiTokens).toHaveBeenCalledWith();
    expect(apiTokensAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialApiTokens: apiTokens }),
    );
  });
});
