import { createMcpHandler, withMcpAuth } from "mcp-handler";

import {
  checkExternalApiRateLimit,
  type RateLimitHeaders,
} from "@/lib/external-api";
import { verifyExternalMcpToken } from "@/lib/mcp-auth";
import { registerExternalMcpTools } from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;
export const runtime = "nodejs";

type ExternalMcpRouteContext = {
  params: Promise<{ transport: string }>;
};

function noStoreResponse(response: Response, rateLimitHeaders?: RateLimitHeaders) {
  const headers = new Headers(response.headers);

  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex");

  if (rateLimitHeaders) {
    headers.set("X-RateLimit-Limit", rateLimitHeaders["X-RateLimit-Limit"]);
    headers.set(
      "X-RateLimit-Remaining",
      rateLimitHeaders["X-RateLimit-Remaining"],
    );
    headers.set("X-RateLimit-Reset", rateLimitHeaders["X-RateLimit-Reset"]);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

const mcpHandler = createMcpHandler(
  registerExternalMcpTools,
  {
    serverInfo: {
      name: "workflow-blueprint-external-api",
      version: "1.0.0",
    },
  },
  {
    basePath: "/api/external/v1",
    disableSse: true,
    maxDuration,
  },
);

const authenticatedMcpHandler = withMcpAuth(
  mcpHandler,
  verifyExternalMcpToken,
  { required: true },
);

async function externalMcpRoute(
  request: Request,
  { params }: ExternalMcpRouteContext,
) {
  const { transport } = await params;

  if (transport !== "mcp") {
    return noStoreResponse(new Response("Not found.", { status: 404 }));
  }

  const rateLimit = await checkExternalApiRateLimit(request, "external-mcp");

  if (rateLimit.kind === "limited") {
    return noStoreResponse(rateLimit.response, rateLimit.headers);
  }

  return noStoreResponse(await authenticatedMcpHandler(request), rateLimit.headers);
}

export {
  externalMcpRoute as DELETE,
  externalMcpRoute as GET,
  externalMcpRoute as POST,
};
