// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const invitationsAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireCurrentAdmin: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  listInvitations: vi.fn(),
}));

vi.mock("@/components/admin/invitations-admin", () => ({
  InvitationsAdmin: (props: Record<string, unknown>) => {
    invitationsAdminMock(props);

    return <div data-testid="invitations-admin" />;
  },
}));

import AdminInvitationsPage from "@/app/(app)/admin/invitations/page";
import { requireCurrentAdmin } from "@/lib/auth";
import { listInvitations } from "@/lib/data";

beforeEach(() => {
  invitationsAdminMock.mockReset();
  vi.mocked(requireCurrentAdmin).mockReset();
  vi.mocked(listInvitations).mockReset();
  vi.mocked(requireCurrentAdmin).mockResolvedValue({ id: "admin-1" } as never);
});

afterEach(() => {
  cleanup();
});

describe("AdminInvitationsPage", () => {
  test("renders InvitationsAdmin with the fetched invitations", async () => {
    const invitations = [{ id: "invitation-1" }] as never;
    vi.mocked(listInvitations).mockResolvedValueOnce(invitations);

    render(await AdminInvitationsPage());

    expect(screen.getByTestId("invitations-admin")).toBeDefined();
    expect(requireCurrentAdmin).toHaveBeenCalledTimes(1);
    expect(listInvitations).toHaveBeenCalledWith();
    expect(invitationsAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialInvitations: invitations }),
    );
  });
});
