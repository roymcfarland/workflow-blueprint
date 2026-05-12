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
