const BOARD_PREF_NAMESPACE = "wb.board" as const;

function preferenceKey(boardSlug: string, prefName: string): string {
  return `${BOARD_PREF_NAMESPACE}.${boardSlug}.${prefName}`;
}

function readPreference<T>(
  boardSlug: string,
  prefName: string,
  validator: (raw: string | null) => T | null,
): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return validator(window.localStorage.getItem(preferenceKey(boardSlug, prefName)));
  } catch {
    return null;
  }
}

function writePreference(boardSlug: string, prefName: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(preferenceKey(boardSlug, prefName), value);
  } catch {
    // Persistence is a progressive enhancement.
  }
}

export type ArchiveMode = "on" | "off";
export const ARCHIVE_MODE_DEFAULT: ArchiveMode = "off";

const isArchiveMode = (raw: string | null): ArchiveMode | null =>
  raw === "on" || raw === "off" ? raw : null;

export function readArchiveMode(boardSlug: string): ArchiveMode | null {
  return readPreference(boardSlug, "archiveMode", isArchiveMode);
}

export function writeArchiveMode(boardSlug: string, value: ArchiveMode): void {
  writePreference(boardSlug, "archiveMode", value);
}

export type ViewMode = "board" | "list";
export const VIEW_MODE_DEFAULT: ViewMode = "board";

const isViewMode = (raw: string | null): ViewMode | null =>
  raw === "board" || raw === "list" ? raw : null;

export function readViewMode(boardSlug: string): ViewMode | null {
  return readPreference(boardSlug, "viewMode", isViewMode);
}

export function writeViewMode(boardSlug: string, value: ViewMode): void {
  writePreference(boardSlug, "viewMode", value);
}

export const NOTES_OPEN_DEFAULT = false;

const isNotesOpen = (raw: string | null): boolean | null => {
  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  return null;
};

export function readNotesOpen(boardSlug: string): boolean | null {
  return readPreference(boardSlug, "notesOpen", isNotesOpen);
}

export function writeNotesOpen(boardSlug: string, value: boolean): void {
  writePreference(boardSlug, "notesOpen", String(value));
}

const DASHBOARD_PREF_NAMESPACE = "wb.dashboard" as const;
const DASHBOARD_SECTION_ORDER_KEY = `${DASHBOARD_PREF_NAMESPACE}.section-order`;

export type DashboardSectionId =
  | "snapshot"
  | "in-progress"
  | "overdue-due-soon"
  | "this-week"
  | "recently-completed"
  | "needs-attention"
  | "on-deck"
  | "board-health"
  | "active-tokens";
export const DASHBOARD_SECTION_ORDER_DEFAULT: DashboardSectionId[] = [
  "snapshot",
  "in-progress",
  "overdue-due-soon",
  "this-week",
  "recently-completed",
  "needs-attention",
  "on-deck",
  "board-health",
  "active-tokens",
];

const isDashboardSectionId = (value: unknown): value is DashboardSectionId =>
  value === "snapshot" ||
  value === "in-progress" ||
  value === "overdue-due-soon" ||
  value === "this-week" ||
  value === "recently-completed" ||
  value === "needs-attention" ||
  value === "on-deck" ||
  value === "board-health" ||
  value === "active-tokens";

export function readDashboardSectionOrder(): DashboardSectionId[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_SECTION_ORDER_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const unique = Array.from(new Set(parsed.filter(isDashboardSectionId)));
    return unique.length === DASHBOARD_SECTION_ORDER_DEFAULT.length ? unique : null;
  } catch {
    return null;
  }
}

export function writeDashboardSectionOrder(order: DashboardSectionId[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DASHBOARD_SECTION_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Persistence is a progressive enhancement.
  }
}
