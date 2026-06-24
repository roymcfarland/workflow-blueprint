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
    const body = JSON.parse(init.body as string) as { label: string; scopes: string[] };

    expect(url).toBe("/api/admin/api-tokens");
    expect(init.method).toBe("POST");
    expect(body.label).toBe("Ops agent");
    expect(body.scopes).toHaveLength(4);
    expect(body.scopes).toEqual(
      expect.arrayContaining(["BOARDS_READ", "TASKS_READ", "SUBTASKS_READ", "TASKS_WRITE"]),
    );
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
});
