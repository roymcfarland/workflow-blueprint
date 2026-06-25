import { z, type ZodType } from "zod";

import {
  externalBoardCreateRequestSchema,
  externalBoardNoteRequestSchema,
  externalBoardResponseSchema,
  externalBoardUpdateRequestSchema,
  externalBoardWriteResponseSchema,
  externalBoardsResponseSchema,
  externalDailySummaryResponseSchema,
  externalDashboardResponseSchema,
  externalOkResponseSchema,
  externalSubtaskCreateRequestSchema,
  externalSubtaskUpdateRequestSchema,
  externalTaskCreateRequestSchema,
  externalTaskResponseSchema,
  externalTaskUpdateRequestSchema,
} from "./external-contract";

type JsonObject = Record<string, unknown>;

function schemaRef(name: string) {
  return {
    $ref: `#/components/schemas/${name}`,
  };
}

function pathParameter(name: string) {
  return {
    in: "path",
    name,
    required: true,
    schema: {
      minLength: 1,
      type: "string",
    },
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
    "X-Request-Id": {
      description:
        "Unique request ID (UUID v4) for log correlation. Echoed on every response, including errors.",
      schema: {
        format: "uuid",
        type: "string",
      },
    },
    "X-RateLimit-Limit": {
      description: "Max requests allowed per rate-limit window.",
      schema: { type: "integer", minimum: 1 },
    },
    "X-RateLimit-Remaining": {
      description:
        "Requests remaining in the current rate-limit window after this request was counted.",
      schema: { type: "integer", minimum: 0 },
    },
    "X-RateLimit-Reset": {
      description: "Unix epoch second when the current rate-limit window resets.",
      schema: { type: "integer", minimum: 0 },
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
    "403": errorResponse("Bearer token is invalid or lacks the required scope."),
    "429": errorResponse("Request rate limit exceeded.", "ExternalRateLimitError"),
    "500": errorResponse("External API response validation failed."),
    "503": errorResponse("EXTERNAL_API_KEY is not configured."),
  };
}

function authenticatedMutation({
  extraResponses = {},
  operationId,
  requestSchemaName,
  responseSchemaName,
  status,
  summary,
}: {
  extraResponses?: JsonObject;
  operationId: string;
  requestSchemaName?: string;
  responseSchemaName: string;
  status: "200" | "201";
  summary: string;
}) {
  return {
    operationId,
    ...(requestSchemaName
      ? {
          requestBody: {
            content: {
              "application/json": {
                schema: schemaRef(requestSchemaName),
              },
            },
            required: true,
          },
        }
      : {}),
    responses: {
      [status]: jsonResponse(summary, responseSchemaName),
      "400": errorResponse("Request body failed validation."),
      ...commonErrorResponses(),
      "404": errorResponse("Requested task or board was not found."),
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
        description: "Bearer-token authenticated endpoints under /api/external/v1/*.",
      },
    ],
    paths: {
      "/api/external/v1/tasks": {
        post: authenticatedMutation({
          extraResponses: {
            "409": errorResponse("Board task limit was reached."),
          },
          operationId: "createExternalTask",
          requestSchemaName: "ExternalTaskCreateRequest",
          responseSchemaName: "ExternalTaskResponse",
          status: "201",
          summary: "Create a task on one of the token owner's boards.",
        }),
      },
      "/api/external/v1/tasks/{id}": {
        parameters: [pathParameter("id")],
        patch: authenticatedMutation({
          operationId: "updateExternalTask",
          requestSchemaName: "ExternalTaskUpdateRequest",
          responseSchemaName: "ExternalTaskResponse",
          status: "200",
          summary: "Update scalar fields on one of the token owner's tasks.",
        }),
        delete: authenticatedMutation({
          operationId: "deleteExternalTask",
          responseSchemaName: "ExternalOkResponse",
          status: "200",
          summary: "Delete one of the token owner's tasks.",
        }),
      },
      "/api/external/v1/tasks/{id}/subtasks": {
        parameters: [pathParameter("id")],
        post: authenticatedMutation({
          extraResponses: {
            "409": errorResponse("Task subtask limit was reached."),
          },
          operationId: "createExternalSubtask",
          requestSchemaName: "ExternalSubtaskCreateRequest",
          responseSchemaName: "ExternalTaskResponse",
          status: "201",
          summary: "Create a subtask on one of the token owner's tasks.",
        }),
      },
      "/api/external/v1/subtasks/{id}": {
        parameters: [pathParameter("id")],
        patch: authenticatedMutation({
          operationId: "updateExternalSubtask",
          requestSchemaName: "ExternalSubtaskUpdateRequest",
          responseSchemaName: "ExternalTaskResponse",
          status: "200",
          summary: "Update one of the token owner's subtasks.",
        }),
        delete: authenticatedMutation({
          operationId: "deleteExternalSubtask",
          responseSchemaName: "ExternalTaskResponse",
          status: "200",
          summary: "Delete one of the token owner's subtasks.",
        }),
      },
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
        post: authenticatedMutation({
          extraResponses: {
            "409": errorResponse("Board limit was reached or slug already exists."),
          },
          operationId: "createExternalBoard",
          requestSchemaName: "ExternalBoardCreateRequest",
          responseSchemaName: "ExternalBoardWriteResponse",
          status: "201",
          summary: "Create a board for the token owner.",
        }),
      },
      "/api/external/v1/boards/{slug}": {
        parameters: [pathParameter("slug")],
        get: authenticatedGet({
          extraResponses: {
            "404": errorResponse(
              "Configured external API user or board was not found.",
            ),
          },
          operationId: "getExternalBoard",
          schemaName: "ExternalBoardResponse",
          summary: "Get one board by slug, including tasks, subtasks, and note content.",
        }),
        patch: authenticatedMutation({
          extraResponses: {
            "409": errorResponse("Board slug already exists."),
          },
          operationId: "updateExternalBoard",
          requestSchemaName: "ExternalBoardUpdateRequest",
          responseSchemaName: "ExternalBoardWriteResponse",
          status: "200",
          summary: "Update one of the token owner's boards.",
        }),
        delete: authenticatedMutation({
          operationId: "deleteExternalBoard",
          responseSchemaName: "ExternalOkResponse",
          status: "200",
          summary: "Delete one of the token owner's boards.",
        }),
      },
      "/api/external/v1/boards/{slug}/note": {
        parameters: [pathParameter("slug")],
        patch: authenticatedMutation({
          operationId: "updateExternalBoardNote",
          requestSchemaName: "ExternalBoardNoteRequest",
          responseSchemaName: "ExternalOkResponse",
          status: "200",
          summary: "Update note content for one of the token owner's boards.",
        }),
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
        ExternalBoardCreateRequest: zodComponentSchema(
          externalBoardCreateRequestSchema,
        ),
        ExternalBoardUpdateRequest: zodComponentSchema(
          externalBoardUpdateRequestSchema,
        ),
        ExternalBoardNoteRequest: zodComponentSchema(
          externalBoardNoteRequestSchema,
        ),
        ExternalBoardWriteResponse: zodComponentSchema(
          externalBoardWriteResponseSchema,
        ),
        ExternalTaskCreateRequest: zodComponentSchema(
          externalTaskCreateRequestSchema,
        ),
        ExternalTaskUpdateRequest: zodComponentSchema(
          externalTaskUpdateRequestSchema,
        ),
        ExternalSubtaskCreateRequest: zodComponentSchema(
          externalSubtaskCreateRequestSchema,
        ),
        ExternalSubtaskUpdateRequest: zodComponentSchema(
          externalSubtaskUpdateRequestSchema,
        ),
        ExternalTaskResponse: zodComponentSchema(externalTaskResponseSchema),
        ExternalOkResponse: zodComponentSchema(externalOkResponseSchema),
        ExternalDailySummaryResponse: zodComponentSchema(
          externalDailySummaryResponseSchema,
        ),
      },
    },
  };
}
