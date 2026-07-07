"use client";

import { Copy, KeyRound, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintCheckbox } from "@/components/blueprint/checkbox";
import { Field } from "@/components/blueprint/field";
import { BlueprintInput } from "@/components/blueprint/input";
import type { SerializedApiToken } from "@/lib/data";
import { cn } from "@/lib/utils";

type ApiTokensAdminProps = {
  initialApiTokens: SerializedApiToken[];
};

type ApiMessage = {
  message?: string;
};

type ApiTokenListResponse = ApiMessage & {
  apiTokens?: SerializedApiToken[];
};

type ApiTokenCreateResponse = ApiMessage & {
  apiToken?: SerializedApiToken;
  token?: string;
};

type ApiTokenScopeValue = SerializedApiToken["scopes"][number];

const apiTokenScopeOptions = [
  { value: "BOARDS_READ", label: "Boards read" },
  { value: "BOARDS_WRITE", label: "Boards write" },
  { value: "TASKS_READ", label: "Tasks read" },
  { value: "TASKS_WRITE", label: "Tasks write" },
  { value: "SUBTASKS_READ", label: "Subtasks read" },
  { value: "SUBTASKS_WRITE", label: "Subtasks write" },
] satisfies readonly { value: ApiTokenScopeValue; label: string }[];

const defaultApiTokenScopes: SerializedApiToken["scopes"] = [
  "BOARDS_READ",
  "TASKS_READ",
  "SUBTASKS_READ",
];

const apiTokenScopeLabels = {
  BOARDS_READ: "Boards read",
  BOARDS_WRITE: "Boards write",
  TASKS_READ: "Tasks read",
  TASKS_WRITE: "Tasks write",
  SUBTASKS_READ: "Subtasks read",
  SUBTASKS_WRITE: "Subtasks write",
} satisfies Record<ApiTokenScopeValue, string>;

const scopeClassName =
  "inline-flex rounded-md border border-line-soft bg-surface-control px-2 py-0.5 text-xs font-semibold text-text-muted";

const statusLabels = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClassName(status: SerializedApiToken["status"]) {
  return cn(
    "inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold",
    status === "ACTIVE" && "border-success/30 bg-success/10 text-success",
    status === "EXPIRED" && "border-line-soft bg-surface-control text-text-muted",
    status === "REVOKED" && "border-danger/30 bg-danger/10 text-danger",
  );
}

export function ApiTokensAdmin({ initialApiTokens }: ApiTokensAdminProps) {
  const [label, setLabel] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<SerializedApiToken["scopes"]>(() => [
    ...defaultApiTokenScopes,
  ]);
  const [apiTokens, setApiTokens] = useState(initialApiTokens);
  const [message, setMessage] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshApiTokens = async () => {
    const response = await fetch("/api/admin/api-tokens");
    const body = (await response.json()) as ApiTokenListResponse;

    if (!response.ok || !body.apiTokens) {
      setMessage(body.message ?? "Unable to refresh API tokens.");
      return;
    }

    setApiTokens(body.apiTokens);
  };

  const toggleScope = (scope: ApiTokenScopeValue) => {
    setSelectedScopes((currentScopes) =>
      currentScopes.includes(scope)
        ? currentScopes.filter((selectedScope) => selectedScope !== scope)
        : [...currentScopes, scope],
    );
  };

  const handleCreateApiToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedLabel = label.trim();
    const scopes = [...selectedScopes];

    if (!trimmedLabel || scopes.length === 0) {
      return;
    }

    setMessage(null);
    setCreatedToken(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/api-tokens", {
        body: JSON.stringify({ label: trimmedLabel, scopes }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as ApiTokenCreateResponse;

      if (!response.ok || !body.token) {
        setMessage(body.message ?? "Unable to create API token.");
        return;
      }

      setLabel("");
      setSelectedScopes([...defaultApiTokenScopes]);
      setMessage(body.message ?? "API token created.");
      setCreatedToken(body.token);

      await refreshApiTokens();
    });
  };

  const handleCopyCreatedToken = () => {
    if (!createdToken || !navigator.clipboard) {
      setMessage("Clipboard unavailable. Select and copy the API token manually.");
      return;
    }

    void navigator.clipboard
      .writeText(createdToken)
      .then(() => setMessage("API token copied."))
      .catch(() => setMessage("Unable to copy the API token. Select and copy it manually."));
  };

  const handleRevokeApiToken = (apiTokenId: string) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/admin/api-tokens/${apiTokenId}/revoke`, {
        method: "POST",
      });
      const body = (await response.json()) as ApiMessage;

      if (!response.ok) {
        setMessage(body.message ?? "Unable to revoke API token.");
        return;
      }

      setMessage("API token revoked.");
      await refreshApiTokens();
    });
  };

  return (
    <div className="auto-fit-grid gap-5 [--auto-fit-min:24rem]">
      <section className="blueprint-surface blueprint-surface-strong p-5 sm:p-6">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h2 className="blueprint-display text-2xl text-text-primary sm:text-3xl">
              Issue token
            </h2>
            <p className="text-sm text-text-muted">
              Create scoped credentials for external API consumers.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleCreateApiToken}>
            <Field htmlFor="api-token-label" label="Label">
              <BlueprintInput
                autoComplete="off"
                id="api-token-label"
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Reporting integration"
                type="text"
                value={label}
              />
            </Field>

            <fieldset className="rounded-lg border border-line-soft bg-surface-control/40 p-4">
              <legend className="px-1 text-sm font-semibold text-text-primary">Scopes</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {apiTokenScopeOptions.map((scope) => (
                  <BlueprintCheckbox
                    checked={selectedScopes.includes(scope.value)}
                    id={`api-token-scope-${scope.value}`}
                    key={scope.value}
                    label={scope.label}
                    onChange={() => toggleScope(scope.value)}
                  />
                ))}
              </div>
            </fieldset>

            <BlueprintButton
              className="w-full"
              disabled={isPending || !label.trim() || selectedScopes.length === 0}
              type="submit"
              variant="hero"
            >
              <KeyRound className="h-4 w-4" />
              {isPending ? "Creating..." : "Create token"}
            </BlueprintButton>
          </form>

          {message ? (
            <p className="blueprint-panel-muted rounded-lg px-4 py-3 text-sm font-semibold text-text-primary">
              {message}
            </p>
          ) : null}

          {createdToken ? (
            <div className="rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm text-text-primary">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="font-semibold">Copy your API token now</p>
                  <p className="text-text-muted">
                    This is the only time you&apos;ll see it. Store it somewhere safe. You
                    can&apos;t view it again.
                  </p>
                </div>
                <BlueprintButton onClick={handleCopyCreatedToken} type="button" variant="ghost">
                  <Copy className="h-4 w-4" />
                  Copy
                </BlueprintButton>
              </div>
              <p className="mt-3 break-all rounded-md border border-line-soft bg-surface-control px-3 py-2 font-mono text-xs text-text-primary">
                {createdToken}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="blueprint-surface blueprint-surface-strong overflow-hidden">
        <div className="border-b border-line-soft px-5 py-4 sm:px-6">
          <h2 className="blueprint-display text-2xl text-text-primary sm:text-3xl">
            API token ledger
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem] border-collapse text-left text-sm">
            <thead className="bg-surface-control text-text-muted">
              <tr>
                <th className="blueprint-eyebrow px-5 py-3">Label</th>
                <th className="blueprint-eyebrow px-5 py-3">Scopes</th>
                <th className="blueprint-eyebrow px-5 py-3">Token</th>
                <th className="blueprint-eyebrow px-5 py-3">Status</th>
                <th className="blueprint-eyebrow px-5 py-3">Last used</th>
                <th className="blueprint-eyebrow px-5 py-3">Created</th>
                <th className="blueprint-eyebrow px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {apiTokens.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-text-muted" colSpan={7}>
                    No API tokens yet.
                  </td>
                </tr>
              ) : (
                apiTokens.map((token) => (
                  <tr className="border-t border-line-soft" key={token.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-text-primary">{token.label}</p>
                    </td>
                    <td className="px-5 py-3">
                      {token.scopes.length > 0 ? (
                        <div className="flex max-w-xs flex-wrap gap-1.5">
                          {token.scopes.map((scope) => (
                            <span className={scopeClassName} key={scope}>
                              {apiTokenScopeLabels[scope]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-muted">&mdash;</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-text-muted">
                      {token.prefix}...
                    </td>
                    <td className="px-5 py-3">
                      <span className={statusClassName(token.status)}>
                        {statusLabels[token.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-muted">
                      {token.lastUsedAt ? formatDate(token.lastUsedAt) : "Never"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-0.5">
                        <p className="text-text-muted">{formatDate(token.createdAt)}</p>
                        <p className="text-xs text-text-muted">By {token.createdBy.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {token.status === "ACTIVE" ? (
                        <BlueprintButton
                          disabled={isPending}
                          onClick={() => handleRevokeApiToken(token.id)}
                          variant="ghost"
                        >
                          <XCircle className="h-4 w-4" />
                          Revoke
                        </BlueprintButton>
                      ) : (
                        <span className="text-xs font-semibold text-text-muted">Revoked</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
