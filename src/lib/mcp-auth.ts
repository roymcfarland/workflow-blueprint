import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { resolveExternalToken } from "@/lib/external-api";
import type { ExternalMcpAuthExtra } from "@/lib/mcp-tools";

export async function verifyExternalMcpToken(
  request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) {
    return undefined;
  }

  const access = await resolveExternalToken(request);

  if (!access) {
    return undefined;
  }

  const extra: ExternalMcpAuthExtra = {
    scopes: access.scopes,
    userId: access.userId,
  };

  return {
    clientId: access.userId,
    extra,
    scopes: access.scopes.map(String),
    token: bearerToken,
  };
}
