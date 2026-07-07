// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ApiTokensAdmin } from "@/components/admin/api-tokens-admin";
import type { SerializedApiToken } from "@/lib/data";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function apiToken(overrides: Partial<SerializedApiToken> = {}): SerializedApiToken {
  return {
    createdAt: "2026-06-24T12:00:00.000Z",
    createdBy: {
      email: "admin@example.test",
      name: "Admin User",
    },
    id: "token-1",
    label: "Reporting integration",
    lastUsedAt: null,
    expiresAt: null,
    prefix: "wbp_1234",
    revokedAt: null,
    scopes: ["BOARDS_READ", "TASKS_READ", "SUBTASKS_READ"],
    status: "ACTIVE",
    ...overrides,
  };
}

function checkbox(name: string) {
  return screen.getByRole("checkbox", { name }) as HTMLInputElement;
}

function submitButton() {
  return screen.getByRole("button", { name: /create token/i }) as HTMLButtonElement;
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

describe("ApiTokensAdmin", () => {
  test("defaults the create form to the read scopes", () => {
    render(<ApiTokensAdmin initialApiTokens={[]} />);

    expect(checkbox("Boards read").checked).toBe(true);
    expect(checkbox("Tasks read").checked).toBe(true);
    expect(checkbox("Subtasks read").checked).toBe(true);
    expect(checkbox("Boards write").checked).toBe(false);
    expect(checkbox("Tasks write").checked).toBe(false);
    expect(checkbox("Subtasks write").checked).toBe(false);
  });

  test("submits the selected scopes with the label", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ message: "API token created.", token: "wbp_secret" }))
      .mockResolvedValueOnce(apiResponse({ apiTokens: [] }));

    render(<ApiTokensAdmin initialApiTokens={[]} />);

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Ops agent" },
    });
    fireEvent.click(checkbox("Tasks write"));
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      expiresInDays?: unknown;
      label: string;
      scopes: string[];
    };

    expect(url).toBe("/api/admin/api-tokens");
    expect(init.method).toBe("POST");
    expect(body.label).toBe("Ops agent");
    expect(body.scopes).toHaveLength(4);
    expect(body.scopes).toEqual(
      expect.arrayContaining(["BOARDS_READ", "TASKS_READ", "SUBTASKS_READ", "TASKS_WRITE"]),
    );
    expect("expiresInDays" in body).toBe(false);
  });

  test("submits selected expiry duration as a number", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ message: "API token created.", token: "wbp_secret" }))
      .mockResolvedValueOnce(apiResponse({ apiTokens: [] }));

    render(<ApiTokensAdmin initialApiTokens={[]} />);

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Thirty-day agent" },
    });
    fireEvent.change(screen.getByLabelText("Expires"), {
      target: { value: "30" },
    });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      expiresInDays?: unknown;
      label: string;
      scopes: string[];
    };

    expect(body.expiresInDays).toBe(30);
  });

  test("disables submit when every scope is deselected", () => {
    render(<ApiTokensAdmin initialApiTokens={[]} />);

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "No-scope token" },
    });
    fireEvent.click(checkbox("Boards read"));
    fireEvent.click(checkbox("Tasks read"));
    fireEvent.click(checkbox("Subtasks read"));

    expect(submitButton().disabled).toBe(true);
  });

  test("renders token scopes in the ledger", () => {
    render(
      <ApiTokensAdmin
        initialApiTokens={[
          apiToken({
            label: "Analytics writer",
            scopes: ["BOARDS_READ", "TASKS_WRITE"],
          }),
        ]}
      />,
    );

    const tokenRow = screen.getByText("Analytics writer").closest("tr");

    expect(tokenRow).not.toBeNull();
    expect(within(tokenRow as HTMLElement).getByText("Boards read")).toBeDefined();
    expect(within(tokenRow as HTMLElement).getByText("Tasks write")).toBeDefined();
  });

  test("renders expiration dates in the ledger", () => {
    const expiringAt = "2026-08-01T14:30:00.000Z";

    render(
      <ApiTokensAdmin
        initialApiTokens={[
          apiToken({
            expiresAt: expiringAt,
            id: "token-expiring",
            label: "Expiring integration",
            lastUsedAt: "2026-07-01T12:00:00.000Z",
          }),
          apiToken({
            id: "token-never",
            label: "Permanent integration",
            lastUsedAt: "2026-07-02T12:00:00.000Z",
          }),
        ]}
      />,
    );

    const expiringRow = screen.getByText("Expiring integration").closest("tr");
    const permanentRow = screen.getByText("Permanent integration").closest("tr");

    expect(expiringRow).not.toBeNull();
    expect(permanentRow).not.toBeNull();
    expect(within(expiringRow as HTMLElement).getByText(formattedDate(expiringAt))).toBeDefined();
    expect(within(permanentRow as HTMLElement).getByText("Never")).toBeDefined();
  });

  test("renders expired tokens without revoke actions", () => {
    render(
      <ApiTokensAdmin
        initialApiTokens={[
          apiToken({
            expiresAt: "2026-07-01T12:00:00.000Z",
            id: "token-expired",
            label: "Expired integration",
            status: "EXPIRED",
          }),
        ]}
      />,
    );

    const tokenRow = screen.getByText("Expired integration").closest("tr");

    expect(tokenRow).not.toBeNull();
    expect(within(tokenRow as HTMLElement).getAllByText("Expired")).toHaveLength(2);
    expect(within(tokenRow as HTMLElement).queryByRole("button", { name: /revoke/i })).toBeNull();
  });
});
