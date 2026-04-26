export const boardStatuses = [
  "ICE_BOX",
  "ON_DECK",
  "IN_PROGRESS",
  "DONE",
  "ARCHIVED",
] as const;

export type TaskStatus = (typeof boardStatuses)[number];

export const statusLabels: Record<TaskStatus, string> = {
  ICE_BOX: "Ice Box",
  ON_DECK: "On Deck",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  ARCHIVED: "Archived",
};

export const statusDescriptions: Record<TaskStatus, string> = {
  ICE_BOX: "Ideas and future work that can wait.",
  ON_DECK: "Prioritized next-up work.",
  IN_PROGRESS: "Tasks currently being worked.",
  DONE: "Recently finished work.",
  ARCHIVED: "Completed or parked reference work.",
};

export const themePreferences = ["day", "night", "system"] as const;

export type ThemePreference = (typeof themePreferences)[number];

export const themePreferenceDbMap = {
  day: "DAY",
  night: "NIGHT",
  system: "SYSTEM",
} as const;

export const themePreferenceUiMap = {
  DAY: "day",
  NIGHT: "night",
  SYSTEM: "system",
} as const;

export const boardDefinitions = [
  {
    slug: "personal",
    name: "Personal",
    iconKey: "personal",
    description: "Personal life admin, routines, and long-range goals.",
  },
  {
    slug: "brightline-labs",
    name: "Brightline Labs",
    iconKey: "labs",
    description: "Growth, product, and operations work for Brightline Labs.",
  },
  {
    slug: "elevated-organics",
    name: "Elevated Organics",
    iconKey: "organics",
    description: "Launch, operations, and retail coordination for Elevated Organics.",
  },
] as const;

export type BoardSlug = (typeof boardDefinitions)[number]["slug"];

export const boardAccentColors = {
  "brightline-labs": "#c94f7c",
  "elevated-organics": "#2f9f85",
  personal: "#4f78e6",
} satisfies Record<BoardSlug, string>;

export const fallbackBoardAccentColor = "#5ab7b9";

export function getBoardAccentColor(slug: string) {
  return slug in boardAccentColors
    ? boardAccentColors[slug as BoardSlug]
    : fallbackBoardAccentColor;
}

export const boardLabelBySlug = Object.fromEntries(
  boardDefinitions.map((board) => [board.slug, board.name]),
) as Record<BoardSlug, string>;

export const boardIconBySlug = Object.fromEntries(
  boardDefinitions.map((board) => [board.slug, board.iconKey]),
) as Record<BoardSlug, string>;

export const sessionCookieName = "workflow-blueprint-session";

export const demoUser = {
  id: "user_demo_alex_blue",
  name: "Alex Blue",
  email: "alex@workflowblueprint.app",
  password: "Blueprint123!",
  avatarLabel: "AB",
  themePreference: "day" as ThemePreference,
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function statusFromToggle(includeArchived: boolean) {
  return includeArchived ? boardStatuses : boardStatuses.filter((status) => status !== "ARCHIVED");
}
