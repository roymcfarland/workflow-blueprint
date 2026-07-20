// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { InvitationsAdmin } from "@/components/admin/invitations-admin";
import type { SerializedInvitation } from "@/lib/data";

let fetchMock: ReturnType<typeof vi.fn>;

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function invitation(
  overrides: Partial<SerializedInvitation> = {},
): SerializedInvitation {
  return {
    acceptedAt: null,
    acceptedBy: null,
    createdAt: "2026-07-20T12:00:00.000Z",
    email: "teammate@example.test",
    expiresAt: "2026-07-27T12:00:00.000Z",
    id: "invitation-1",
    invitedBy: {
      email: "admin@example.test",
      name: "Admin User",
    },
    revokedAt: null,
    status: "PENDING",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InvitationsAdmin", () => {
  test("renders the empty invitation ledger", () => {
    render(<InvitationsAdmin initialInvitations={[]} />);

    expect(screen.getByText("No invitations yet.")).toBeDefined();
  });

  test("renders a pending invitation with a revoke action", () => {
    render(<InvitationsAdmin initialInvitations={[invitation()]} />);

    const row = screen.getByText("teammate@example.test").closest("tr");

    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Pending")).toBeDefined();
    expect(within(row as HTMLElement).getByRole("button", { name: "Revoke" })).toBeDefined();
  });

  test("renders a closed invitation without a revoke action", () => {
    render(
      <InvitationsAdmin
        initialInvitations={[
          invitation({
            acceptedAt: "2026-07-21T12:00:00.000Z",
            acceptedBy: {
              email: "teammate@example.test",
              name: "Team Mate",
            },
            status: "ACCEPTED",
          }),
        ]}
      />,
    );

    const row = screen.getByText("teammate@example.test").closest("tr");

    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Accepted")).toBeDefined();
    expect(within(row as HTMLElement).getByText("Closed")).toBeDefined();
    expect(within(row as HTMLElement).queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  test("creates an invitation, shows its preview link, and refreshes the ledger", async () => {
    const previewInviteUrl = "http://127.0.0.1:3000/sign-up?invite=preview-token";
    const refreshedInvitation = invitation({
      email: "new-teammate@example.test",
      id: "invitation-2",
    });
    fetchMock
      .mockResolvedValueOnce(
        apiResponse({ message: "Invitation created.", previewInviteUrl }),
      )
      .mockResolvedValueOnce(apiResponse({ invitations: [refreshedInvitation] }));

    render(
      <InvitationsAdmin
        initialInvitations={[invitation({ email: "old-teammate@example.test" })]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new-teammate@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [createUrl, createRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe("/api/admin/invitations");
    expect(createRequest.method).toBe("POST");
    expect(JSON.parse(createRequest.body as string)).toEqual({
      email: "new-teammate@example.test",
    });
    expect(fetchMock.mock.calls[1]).toEqual(["/api/admin/invitations"]);
    expect(screen.getByRole("link", { name: previewInviteUrl }).getAttribute("href")).toBe(
      previewInviteUrl,
    );
    expect(screen.getByText("new-teammate@example.test")).toBeDefined();
    expect(screen.queryByText("old-teammate@example.test")).toBeNull();
  });

  test("preserves the email and shows the API message when creation fails", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "An active invitation already exists." }, 409),
    );

    render(<InvitationsAdmin initialInvitations={[]} />);

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    fireEvent.change(emailInput, {
      target: { value: "existing@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(await screen.findByText("An active invitation already exists.")).toBeDefined();
    expect(emailInput.value).toBe("existing@example.test");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("revokes a pending invitation and refreshes the ledger", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ message: "Revoked by admin." }))
      .mockResolvedValueOnce(
        apiResponse({
          invitations: [
            invitation({
              revokedAt: "2026-07-21T12:00:00.000Z",
              status: "REVOKED",
            }),
          ],
        }),
      );

    render(<InvitationsAdmin initialInvitations={[invitation()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/admin/invitations/invitation-1/revoke",
      { method: "POST" },
    ]);
    expect(fetchMock.mock.calls[1]).toEqual(["/api/admin/invitations"]);
    expect(screen.getByText("Invitation revoked.")).toBeDefined();
    expect(screen.getByText("Revoked")).toBeDefined();
  });

  test("shows an error and does not refresh when revoking fails", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "Invitation already revoked." }, 400));

    render(<InvitationsAdmin initialInvitations={[invitation()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(screen.getByText("Invitation already revoked.")).toBeDefined(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDefined();
  });

  test("shows an error when the post-revoke ledger refresh fails", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ message: "Revoked by admin." }))
      .mockResolvedValueOnce(apiResponse({ message: "Refresh unavailable." }, 500));

    render(<InvitationsAdmin initialInvitations={[invitation()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Refresh unavailable.")).toBeDefined());
  });
});
