import { z, type ZodType } from "zod";

import {
  externalBoardResponseSchema,
  externalBoardsResponseSchema,
  externalDailySummaryResponseSchema,
  externalDashboardResponseSchema,
} from "./external-contract";

type JsonObject = Record<string, unknown>;

function schemaRef(name: string) {
  return {
    $ref: `#/components/schemas/${name}`,
  };
}

function zodComponentSchema(schema: ZodType): JsonObject {
  const jsonSchema = { ...(z.toJSONSchema(schema) as JsonObject) };

  delete jsonSchema.$schema;
  return jsonSchema;
}

function responseHeaders() {
  return {
    "Cache-Control": {
      description: "External API responses are not cacheable.",
      schema: {
        const: "no-store",
        type: "string",
      },
    },
    "X-Robots-Tag": {
      description: "External API responses are excluded from indexing.",
      schema: {
        const: "noindex",
        type: "string",
      },
    },
  };
}

function jsonResponse(description: string, schemaName: string) {
  return {
    content: {
      "application/json": {
        schema: schemaRef(schemaName),
      },
    },
    description,
    headers: responseHeaders(),
  };
}

function errorResponse(description: string, schemaName = "ExternalApiError") {
  return jsonResponse(description, schemaName);
}

function commonErrorResponses() {
  return {
    "401": errorResponse("Authorization header is missing or malformed."),
    "403": errorResponse("Bearer token does not match EXTERNAL_API_KEY."),
    "429": errorResponse("Request rate limit exceeded.", "ExternalRateLimitError"),
    "500": errorResponse("External API response validation failed."),
    "503": errorResponse("EXTERNAL_API_KEY is not configured."),
  };
}

function authenticatedGet({
  extraResponses = {},
  operationId,
  schemaName,
  summary,
}: {
  extraResponses?: JsonObject;
  operationId: string;
  schemaName: string;
  summary: string;
}) {
  return {
    operationId,
    responses: {
      "200": jsonResponse(summary, schemaName),
      ...commonErrorResponses(),
      ...extraResponses,
    },
    security: [
      {
        ExternalApiKeyAuth: [],
      },
    ],
    summary,
    tags: ["External API v1"],
  };
}

export function buildExternalOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Workflow Blueprint External API",
      version: "1.0.0",
      description:
        "Stable private API contract for project-owned consumers of Workflow Blueprint planning data.",
    },
    servers: [
      {
        url: "https://www.workflowblueprint.io",
      },
    ],
    tags: [
      {
        name: "External API v1",
        description: "Bearer-token authenticated read surface under /api/external/v1/*.",
      },
    ],
    paths: {
      "/api/external/v1/dashboard": {
        get: authenticatedGet({
          extraResponses: {
            "404": errorResponse("Configured external API user was not found."),
          },
          operationId: "getExternalDashboard",
          schemaName: "ExternalDashboardResponse",
          summary: "Aggregate dashboard payload.",
        }),
      },
      "/api/external/v1/boards": {
        get: authenticatedGet({
          extraResponses: {
            "404": errorResponse("Configured external API user was not found."),
          },
          operationId: "getExternalBoards",
          schemaName: "ExternalBoardsResponse",
          summary: "List boards owned by the configured external user.",
        }),
      },
      "/api/external/v1/boards/{slug}": {
        get: {
          ...authenticatedGet({
            extraResponses: {
              "404": errorResponse(
                "Configured external API user or board was not found.",
              ),
            },
            operationId: "getExternalBoard",
            schemaName: "ExternalBoardResponse",
            summary: "Get one board by slug, including tasks, subtasks, and note content.",
          }),
          parameters: [
            {
              in: "path",
              name: "slug",
              required: true,
              schema: {
                minLength: 1,
                type: "string",
              },
            },
          ],
        },
      },
      "/api/external/v1/daily-summary": {
        get: authenticatedGet({
          operationId: "getExternalDailySummary",
          schemaName: "ExternalDailySummaryResponse",
          summary: "Daily briefing payload used by external automation.",
        }),
      },
    },
    components: {
      securitySchemes: {
        ExternalApiKeyAuth: {
          bearerFormat: "EXTERNAL_API_KEY",
          description:
            "Send the configured EXTERNAL_API_KEY value in the Authorization header as a Bearer token.",
          scheme: "bearer",
          type: "http",
        },
      },
      schemas: {
        ExternalApiError: {
          additionalProperties: false,
          properties: {
            ok: {
              const: false,
              type: "boolean",
            },
            error: {
              type: "string",
            },
          },
          required: ["ok", "error"],
          type: "object",
        },
        ExternalRateLimitError: {
          additionalProperties: false,
          properties: {
            message: {
              type: "string",
            },
          },
          required: ["message"],
          type: "object",
        },
        ExternalDashboardResponse: zodComponentSchema(externalDashboardResponseSchema),
        ExternalBoardsResponse: zodComponentSchema(externalBoardsResponseSchema),
        ExternalBoardResponse: zodComponentSchema(externalBoardResponseSchema),
        ExternalDailySummaryResponse: zodComponentSchema(
          externalDailySummaryResponseSchema,
        ),
      },
    },
  };
}
