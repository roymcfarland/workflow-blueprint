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

async function createApiToken(createdToken = "wbp_secret") {
  fetchMock
    .mockResolvedValueOnce(
      apiResponse({ message: "API token created.", token: createdToken }),
    )
    .mockResolvedValueOnce(apiResponse({ apiTokens: [] }));

  render(<ApiTokensAdmin initialApiTokens={[]} />);

  fireEvent.change(screen.getByLabelText("Label"), {
    target: { value: "Ops agent" },
  });
  fireEvent.click(submitButton());

  await screen.findByText("Copy your API token now");
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

  test("shows the server message when token creation fails", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "Label already in use." }, 400));

    render(<ApiTokensAdmin initialApiTokens={[]} />);

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Duplicate agent" },
    });
    fireEvent.click(submitButton());

    expect(await screen.findByText("Label already in use.")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Copy your API token now")).toBeNull();
  });

  test("shows a refresh failure after token creation succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ message: "API token created.", token: "wbp_secret" }))
      .mockResolvedValueOnce(
        apiResponse({ message: "Unable to refresh API tokens." }, 500),
      );

    render(<ApiTokensAdmin initialApiTokens={[]} />);

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Ops agent" },
    });
    fireEvent.click(submitButton());

    expect(await screen.findByText("Copy your API token now")).toBeDefined();
    expect(screen.getByText("wbp_secret")).toBeDefined();
    expect(await screen.findByText("Unable to refresh API tokens.")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("ignores a direct form submission when the label is empty", () => {
    const { container } = render(<ApiTokensAdmin initialApiTokens={[]} />);
    const form = container.querySelector("form");

    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows manual copy guidance when the clipboard is unavailable", async () => {
    await createApiToken();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(
      screen.getByText("Clipboard unavailable. Select and copy the API token manually."),
    ).toBeDefined();
  });

  test("copies a created token to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await createApiToken();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("wbp_secret"));
    expect(await screen.findByText("API token copied.")).toBeDefined();
  });

  test("shows manual copy guidance when clipboard writing fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));

    await createApiToken();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(
      await screen.findByText("Unable to copy the API token. Select and copy it manually."),
    ).toBeDefined();
  });

  test("revokes an active token and refreshes the ledger", async () => {
    const token = apiToken();
    fetchMock
      .mockResolvedValueOnce(apiResponse({ message: "API token revoked." }))
      .mockResolvedValueOnce(apiResponse({ apiTokens: [] }));

    render(<ApiTokensAdmin initialApiTokens={[token]} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/admin/api-tokens/${token.id}/revoke`,
      { method: "POST" },
    );
    expect(screen.getByText("API token revoked.")).toBeDefined();
  });

  test("shows the server message when token revocation fails", async () => {
    const token = apiToken();
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "Token already revoked." }, 400),
    );

    render(<ApiTokensAdmin initialApiTokens={[token]} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(await screen.findByText("Token already revoked.")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
