import * as crypto from "node:crypto";

export type ExternalApiOutcome =
  | "ok"
  | "auth_failed"
  | "rate_limited"
  | "not_found"
  | "validation_failed"
  | "server_error";

export type ExternalApiLogFields = {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  apiKeyPrefix: string | null;
  userId: string | null;
  outcome: ExternalApiOutcome;
};

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function logExternalApiRequest(fields: ExternalApiLogFields): void {
  console.log(
    JSON.stringify({
      kind: "external_api_request",
      ...fields,
      timestamp: new Date().toISOString(),
    }),
  );
}
