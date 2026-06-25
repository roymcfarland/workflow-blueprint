import { ApiTokenScope } from "@prisma/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  createBoardForUser,
  createSubtaskForUser,
  createTaskForBoard,
  deleteBoardForUser,
  deleteSubtaskForUser,
  deleteTaskForUser,
  getBoardSnapshot,
  getBoardSummaries,
  getDashboardSnapshot,
  updateBoardForUser,
  updateBoardNote,
  updateSubtaskForUser,
  updateTaskFieldsForUser,
} from "@/lib/data";
import { buildExternalDailySummary } from "@/lib/external-api";
import {
  externalBoardCreateRequestSchema,
  externalBoardNoteRequestSchema,
  externalBoardUpdateRequestSchema,
  externalSubtaskCreateRequestSchema,
  externalSubtaskUpdateRequestSchema,
  externalTaskCreateRequestSchema,
  externalTaskUpdateRequestSchema,
} from "@/lib/external-contract";
import type { TaskInput } from "@/lib/validators";

export type ExternalMcpAuthExtra = {
  scopes: ApiTokenScope[];
  userId: string;
};

type McpToolRequestExtra = {
  authInfo?: AuthInfo;
};

type ExternalMcpToolDefinition<TInput> = {
  description: string;
  execute: (userId: string, input: TInput) => Promise<unknown> | unknown;
  inputSchema: z.ZodType<TInput>;
  name: ExternalMcpToolName;
  requiredScope: ApiTokenScope;
  title: string;
};

type AnyExternalMcpToolDefinition = Omit<
  ExternalMcpToolDefinition<unknown>,
  "execute" | "inputSchema"
> & {
  execute: (userId: string, input: unknown) => Promise<unknown> | unknown;
  inputSchema: z.ZodType;
};

const externalMcpToolNameList = [
  "get_dashboard",
  "list_boards",
  "get_board",
  "get_daily_summary",
  "create_task",
  "update_task",
  "delete_task",
  "create_board",
  "update_board",
  "delete_board",
  "update_board_note",
  "create_subtask",
  "update_subtask",
  "delete_subtask",
] as const;

export type ExternalMcpToolName = (typeof externalMcpToolNameList)[number];

const apiTokenScopes = new Set<ApiTokenScope>(Object.values(ApiTokenScope));
const emptyToolInputSchema = z.object({}).default({});
const idInputSchema = z.string().min(1);
const boardSlugInputSchema = z.string().min(1);
const getBoardInputSchema = z.object({ slug: boardSlugInputSchema });
const deleteTaskInputSchema = z.object({ taskId: idInputSchema });
const deleteBoardInputSchema = z.object({ slug: boardSlugInputSchema });
const deleteSubtaskInputSchema = z.object({ subtaskId: idInputSchema });
const updateTaskInputSchema = z.object({
  fields: externalTaskUpdateRequestSchema,
  taskId: idInputSchema,
});
const updateBoardInputSchema = z.object({
  fields: externalBoardUpdateRequestSchema,
  slug: boardSlugInputSchema,
});
const updateBoardNoteInputSchema = z.object({
  body: externalBoardNoteRequestSchema,
  slug: boardSlugInputSchema,
});
const createSubtaskInputSchema = z.object({
  body: externalSubtaskCreateRequestSchema,
  taskId: idInputSchema,
});
const updateSubtaskInputSchema = z.object({
  fields: externalSubtaskUpdateRequestSchema,
  subtaskId: idInputSchema,
});

function defineExternalMcpTool<TInput>(
  definition: ExternalMcpToolDefinition<TInput>,
): AnyExternalMcpToolDefinition {
  return definition as AnyExternalMcpToolDefinition;
}

function isApiTokenScope(value: unknown): value is ApiTokenScope {
  return typeof value === "string" && apiTokenScopes.has(value as ApiTokenScope);
}

function externalMcpAuthExtra(authInfo: AuthInfo | undefined) {
  const extra = authInfo?.extra;

  if (
    !extra ||
    typeof extra.userId !== "string" ||
    !Array.isArray(extra.scopes) ||
    !extra.scopes.every(isApiTokenScope)
  ) {
    return null;
  }

  return {
    scopes: extra.scopes,
    userId: extra.userId,
  } satisfies ExternalMcpAuthExtra;
}

function mcpTextResult(result: unknown): CallToolResult {
  return {
    content: [
      {
        text: JSON.stringify(result ?? { ok: true }),
        type: "text",
      },
    ],
  };
}

function mcpErrorResult(message: string): CallToolResult {
  return {
    content: [{ text: message, type: "text" }],
    isError: true,
  };
}

function messageForError(error: unknown) {
  return error instanceof Error ? error.message : "MCP tool failed.";
}

function normalizeNullableDescription<T extends { description?: string | null }>(
  input: T,
) {
  if (!("description" in input)) {
    return input;
  }

  return {
    ...input,
    description: input.description ? input.description : null,
  };
}

function taskInputForCreate(
  input: z.infer<typeof externalTaskCreateRequestSchema>,
): { boardSlug: string; taskInput: TaskInput } {
  const { boardSlug, ...fields } = input;

  return {
    boardSlug,
    taskInput: {
      ...fields,
      description: fields.description ? fields.description : null,
      subtasks: [],
    },
  };
}

const externalMcpTools = [
  defineExternalMcpTool({
    description: "Get the token owner's dashboard snapshot.",
    execute: (userId) => getDashboardSnapshot(userId),
    inputSchema: emptyToolInputSchema,
    name: "get_dashboard",
    requiredScope: ApiTokenScope.TASKS_READ,
    title: "Get Dashboard",
  }),
  defineExternalMcpTool({
    description: "List the token owner's boards.",
    execute: async (userId) => ({ boards: await getBoardSummaries(userId) }),
    inputSchema: emptyToolInputSchema,
    name: "list_boards",
    requiredScope: ApiTokenScope.BOARDS_READ,
    title: "List Boards",
  }),
  defineExternalMcpTool({
    description: "Get one owner-scoped board by slug.",
    execute: async (userId, input: z.infer<typeof getBoardInputSchema>) => {
      const board = await getBoardSnapshot(userId, input.slug);

      if (!board) {
        throw new Error("Board not found.");
      }

      return board;
    },
    inputSchema: getBoardInputSchema,
    name: "get_board",
    requiredScope: ApiTokenScope.BOARDS_READ,
    title: "Get Board",
  }),
  defineExternalMcpTool({
    description: "Get the token owner's daily task summary.",
    execute: (userId) => buildExternalDailySummary(userId),
    inputSchema: emptyToolInputSchema,
    name: "get_daily_summary",
    requiredScope: ApiTokenScope.TASKS_READ,
    title: "Get Daily Summary",
  }),
  defineExternalMcpTool({
    description: "Create a task on one of the token owner's boards.",
    execute: (userId, input: z.infer<typeof externalTaskCreateRequestSchema>) => {
      const { boardSlug, taskInput } = taskInputForCreate(input);

      return createTaskForBoard(userId, boardSlug, taskInput);
    },
    inputSchema: externalTaskCreateRequestSchema,
    name: "create_task",
    requiredScope: ApiTokenScope.TASKS_WRITE,
    title: "Create Task",
  }),
  defineExternalMcpTool({
    description: "Update scalar fields on one of the token owner's tasks.",
    execute: (userId, input: z.infer<typeof updateTaskInputSchema>) =>
      updateTaskFieldsForUser(
        userId,
        input.taskId,
        normalizeNullableDescription(input.fields),
      ),
    inputSchema: updateTaskInputSchema,
    name: "update_task",
    requiredScope: ApiTokenScope.TASKS_WRITE,
    title: "Update Task",
  }),
  defineExternalMcpTool({
    description: "Delete one of the token owner's tasks.",
    execute: async (userId, input: z.infer<typeof deleteTaskInputSchema>) => {
      await deleteTaskForUser(userId, input.taskId);

      return { ok: true };
    },
    inputSchema: deleteTaskInputSchema,
    name: "delete_task",
    requiredScope: ApiTokenScope.TASKS_WRITE,
    title: "Delete Task",
  }),
  defineExternalMcpTool({
    description: "Create a board for the token owner.",
    execute: (userId, input: z.infer<typeof externalBoardCreateRequestSchema>) =>
      createBoardForUser(userId, normalizeNullableDescription(input)),
    inputSchema: externalBoardCreateRequestSchema,
    name: "create_board",
    requiredScope: ApiTokenScope.BOARDS_WRITE,
    title: "Create Board",
  }),
  defineExternalMcpTool({
    description: "Update one of the token owner's boards.",
    execute: async (userId, input: z.infer<typeof updateBoardInputSchema>) => {
      const result = await updateBoardForUser(
        userId,
        input.slug,
        normalizeNullableDescription(input.fields) as Parameters<
          typeof updateBoardForUser
        >[2],
      );

      return result.updated;
    },
    inputSchema: updateBoardInputSchema,
    name: "update_board",
    requiredScope: ApiTokenScope.BOARDS_WRITE,
    title: "Update Board",
  }),
  defineExternalMcpTool({
    description: "Delete one of the token owner's boards.",
    execute: async (userId, input: z.infer<typeof deleteBoardInputSchema>) => {
      await deleteBoardForUser(userId, input.slug);

      return { ok: true };
    },
    inputSchema: deleteBoardInputSchema,
    name: "delete_board",
    requiredScope: ApiTokenScope.BOARDS_WRITE,
    title: "Delete Board",
  }),
  defineExternalMcpTool({
    description: "Update the note on one of the token owner's boards.",
    execute: async (userId, input: z.infer<typeof updateBoardNoteInputSchema>) => {
      await updateBoardNote(userId, input.slug, input.body.content);

      return { ok: true };
    },
    inputSchema: updateBoardNoteInputSchema,
    name: "update_board_note",
    requiredScope: ApiTokenScope.BOARDS_WRITE,
    title: "Update Board Note",
  }),
  defineExternalMcpTool({
    description: "Create a subtask on one of the token owner's tasks.",
    execute: (userId, input: z.infer<typeof createSubtaskInputSchema>) =>
      createSubtaskForUser(userId, input.taskId, input.body),
    inputSchema: createSubtaskInputSchema,
    name: "create_subtask",
    requiredScope: ApiTokenScope.SUBTASKS_WRITE,
    title: "Create Subtask",
  }),
  defineExternalMcpTool({
    description: "Update one of the token owner's subtasks.",
    execute: (userId, input: z.infer<typeof updateSubtaskInputSchema>) =>
      updateSubtaskForUser(userId, input.subtaskId, input.fields),
    inputSchema: updateSubtaskInputSchema,
    name: "update_subtask",
    requiredScope: ApiTokenScope.SUBTASKS_WRITE,
    title: "Update Subtask",
  }),
  defineExternalMcpTool({
    description: "Delete one of the token owner's subtasks.",
    execute: (userId, input: z.infer<typeof deleteSubtaskInputSchema>) =>
      deleteSubtaskForUser(userId, input.subtaskId),
    inputSchema: deleteSubtaskInputSchema,
    name: "delete_subtask",
    requiredScope: ApiTokenScope.SUBTASKS_WRITE,
    title: "Delete Subtask",
  }),
];

export function externalMcpToolNames() {
  return [...externalMcpToolNameList];
}

export async function executeExternalMcpTool(
  name: ExternalMcpToolName,
  input: unknown,
  extra: McpToolRequestExtra,
): Promise<CallToolResult> {
  const tool = externalMcpTools.find((item) => item.name === name);

  if (!tool) {
    return mcpErrorResult(`Unknown MCP tool: ${name}.`);
  }

  const parsed = tool.inputSchema.safeParse(input);

  if (!parsed.success) {
    return mcpErrorResult(
      parsed.error.issues[0]?.message ?? "Invalid MCP tool input.",
    );
  }

  const auth = externalMcpAuthExtra(extra.authInfo);

  if (!auth) {
    return mcpErrorResult("Authentication required.");
  }

  if (!auth.scopes.includes(tool.requiredScope)) {
    return mcpErrorResult(`Insufficient token scope: requires ${tool.requiredScope}.`);
  }

  try {
    return mcpTextResult(await tool.execute(auth.userId, parsed.data));
  } catch (error) {
    return mcpErrorResult(messageForError(error));
  }
}

export function registerExternalMcpTools(server: McpServer) {
  for (const tool of externalMcpTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        title: tool.title,
      },
      (input: unknown, extra: McpToolRequestExtra) =>
        executeExternalMcpTool(tool.name, input, extra),
    );
  }
}
