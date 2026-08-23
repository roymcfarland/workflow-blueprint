export const boardStatuses = [
  "ICE_BOX",
  "ON_DECK",
  "IN_PROGRESS",
  "DONE",
  "ARCHIVED",
] as const;

export type TaskStatus = (typeof boardStatuses)[number];

export const itemPriorities = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export type ItemPriority = (typeof itemPriorities)[number];

export const priorityLabels: Record<ItemPriority, string> = {
  NONE: "—",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const recurrencePatterns = [
  "NONE",
  "DAILY",
  "WEEKLY",
  "BI_WEEKLY",
  "MONTHLY",
  "SEMI_ANNUALLY",
  "ANNUALLY",
] as const;

export type RecurrencePattern = (typeof recurrencePatterns)[number];

export const recurrenceLabels: Record<RecurrencePattern, string> = {
  NONE: "Does not repeat",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BI_WEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  SEMI_ANNUALLY: "Every 6 months",
  ANNUALLY: "Annually",
};

export const statusLabels: Record<TaskStatus, string> = {
  ICE_BOX: "Backlog",
  ON_DECK: "Up Next",
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

export const starterBoard = {
  slug: "personal",
  name: "Personal",
  iconKey: "personal",
  description: "Personal life admin, routines, and long-range goals.",
} as const;

export const boardDefinitions = [
  starterBoard,
  {
    slug: "bag-end",
    name: "Bag End",
    iconKey: "home",
    description: "Hobbit-hole comforts, the garden, and a well-stocked pantry.",
  },
  {
    slug: "the-adventure",
    name: "The Adventure",
    iconKey: "compass",
    description: "There and back again — the road to the Lonely Mountain with thirteen dwarves and a wizard.",
  },
  {
    slug: "there-and-back-again",
    name: "There & Back Again",
    iconKey: "book",
    description: "Writing my memoir — a hobbit's tale, one chapter at a time.",
  },
] as const;

export type BoardSlug = (typeof boardDefinitions)[number]["slug"];

const boardAccentColors: Record<string, string> = {
  "bag-end": "#2f9f85",
  "the-adventure": "#df7d22",
  "there-and-back-again": "#9b6bd6",
  personal: "#4f78e6",
};

export const fallbackBoardAccentColor = "#5ab7b9";

export const boardAccentPalette = [
  "#4f78e6",
  "#2f9f85",
  "#c94f7c",
  "#5ab7b9",
  "#df7d22",
  "#9b6bd6",
  "#d4495a",
  "#3aa0d6",
  "#e0a93b",
  "#64748b",
] as const;

export type BoardAccentColor = (typeof boardAccentPalette)[number];

/**
 * Darkened variants of each accent, used ONLY where the accent becomes a filled
 * background behind white text (the active sidebar nav item). White on the raw
 * accents fails WCAG AA on 9 of 10 presets — as low as 2.12:1 on #e0a93b. Each
 * value below reaches at least 4.55:1 with white, derived by reducing HSL
 * lightness while preserving hue and saturation.
 *
 * Do not use these anywhere the accent is decorative or acts as text: the swatch
 * pickers, the dashboard donut, and the board icons all keep the vivid palette.
 */
export const boardAccentFillColors: Record<BoardAccentColor, string> = {
  "#4f78e6": "#426ee4",
  "#2f9f85": "#27836e",
  "#c94f7c": "#c74776",
  "#5ab7b9": "#377f81",
  "#df7d22": "#af6219",
  "#9b6bd6": "#905bd2",
  "#d4495a": "#d23f51",
  "#3aa0d6": "#247dac",
  "#e0a93b": "#986d18",
  "#64748b": "#64748b",
};

export function getBoardAccentFillColor(accent: string) {
  return boardAccentFillColors[accent as BoardAccentColor] ?? accent;
}

export const labelColorPalette = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

export type LabelColor = (typeof labelColorPalette)[number];

export const MAX_LABELS_PER_TASK = 10;
export const MAX_CHECKLIST_ITEMS_PER_TASK = 50;
export const MAX_ATTACHMENTS_PER_TASK = 10;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_ATTACHMENT_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
] as const;

export function getBoardAccentColor(slug: string) {
  return boardAccentColors[slug] ?? fallbackBoardAccentColor;
}

export const availableBoardIcons = [
  { key: "personal", label: "Personal" },
  { key: "briefcase", label: "Briefcase" },
  { key: "labs", label: "Lab" },
  { key: "organics", label: "Leaf" },
  { key: "rocket", label: "Rocket" },
  { key: "target", label: "Target" },
  { key: "lightbulb", label: "Idea" },
  { key: "book", label: "Book" },
  { key: "star", label: "Star" },
  { key: "heart", label: "Heart" },
  { key: "code", label: "Code" },
  { key: "globe", label: "Globe" },
  { key: "home", label: "Home" },
  { key: "building", label: "Building" },
  { key: "graduation", label: "Education" },
  { key: "compass", label: "Compass" },
  { key: "calendar", label: "Calendar" },
  { key: "chart", label: "Chart" },
  { key: "trending", label: "Growth" },
  { key: "wallet", label: "Wallet" },
  { key: "cart", label: "Shopping" },
  { key: "music", label: "Music" },
  { key: "camera", label: "Camera" },
  { key: "palette", label: "Art" },
  { key: "dumbbell", label: "Fitness" },
  { key: "plane", label: "Travel" },
  { key: "coffee", label: "Coffee" },
  { key: "flame", label: "Flame" },
  { key: "zap", label: "Energy" },
  { key: "gift", label: "Gift" },
  { key: "users", label: "Team" },
  { key: "shield", label: "Shield" },
  { key: "map", label: "Map" },
  { key: "pencil", label: "Notes" },
  { key: "sparkles", label: "Sparkles" },
  { key: "trophy", label: "Trophy" },
] as const;

export const boardIconKeys = availableBoardIcons.map((icon) => icon.key);

export const sessionCookieName = "workflow-blueprint-session";

export const demoUser = {
  id: "user_demo_alex_blue",
  name: "Bilbo Baggins",
  email: "alex@workflowblueprint.app",
  avatarLabel: "BB",
  themePreference: "day" as ThemePreference,
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
