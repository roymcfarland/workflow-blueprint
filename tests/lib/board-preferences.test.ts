import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ARCHIVE_MODE_DEFAULT,
  DASHBOARD_SECTION_ORDER_DEFAULT,
  NOTES_OPEN_DEFAULT,
  VIEW_MODE_DEFAULT,
  readArchiveMode,
  readDashboardSectionOrder,
  readNotesOpen,
  readViewMode,
  writeArchiveMode,
  writeDashboardSectionOrder,
  writeNotesOpen,
  writeViewMode,
} from "@/lib/board-preferences";

function installWindowStorage() {
  vi.stubGlobal("window", {
    localStorage: globalThis.localStorage,
  });
}

beforeEach(() => {
  localStorage.clear();
  installWindowStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("board preferences", () => {
  test("exports expected defaults", () => {
    expect(ARCHIVE_MODE_DEFAULT).toBe("off");
    expect(VIEW_MODE_DEFAULT).toBe("board");
    expect(NOTES_OPEN_DEFAULT).toBe(false);
  });

  test("readArchiveMode returns null when localStorage is empty", () => {
    expect(readArchiveMode("alpha")).toBeNull();
  });

  test("readArchiveMode returns a written archive mode", () => {
    writeArchiveMode("alpha", "off");

    expect(readArchiveMode("alpha")).toBe("off");
  });

  test("readArchiveMode returns null for garbage stored values", () => {
    localStorage.setItem("wb.board.alpha.archiveMode", "banana");

    expect(readArchiveMode("alpha")).toBeNull();
  });

  test("archive mode preferences are isolated by board slug", () => {
    writeArchiveMode("beta", "on");

    expect(readArchiveMode("alpha")).toBeNull();
    expect(readArchiveMode("beta")).toBe("on");
  });

  test("readViewMode returns null when localStorage is empty", () => {
    expect(readViewMode("alpha")).toBeNull();
  });

  test("readViewMode returns a written view mode", () => {
    writeViewMode("alpha", "board");

    expect(readViewMode("alpha")).toBe("board");
  });

  test("readViewMode returns null for garbage stored values", () => {
    localStorage.setItem("wb.board.alpha.viewMode", "banana");

    expect(readViewMode("alpha")).toBeNull();
  });

  test("view mode preferences are isolated by board slug", () => {
    writeViewMode("beta", "list");

    expect(readViewMode("alpha")).toBeNull();
    expect(readViewMode("beta")).toBe("list");
  });

  test("readNotesOpen returns null when localStorage is empty", () => {
    expect(readNotesOpen("alpha")).toBeNull();
  });

  test("readNotesOpen returns a written notes-open value", () => {
    writeNotesOpen("alpha", false);

    expect(readNotesOpen("alpha")).toBe(false);
    expect(localStorage.getItem("wb.board.alpha.notesOpen")).toBe("false");
  });

  test("readNotesOpen returns null for garbage stored values", () => {
    localStorage.setItem("wb.board.alpha.notesOpen", "banana");

    expect(readNotesOpen("alpha")).toBeNull();
  });

  test("notes-open preferences are isolated by board slug", () => {
    writeNotesOpen("beta", true);

    expect(readNotesOpen("alpha")).toBeNull();
    expect(readNotesOpen("beta")).toBe(true);
    expect(localStorage.getItem("wb.board.beta.notesOpen")).toBe("true");
  });

  test("readers return null when localStorage.getItem throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(readArchiveMode("alpha")).toBeNull();
    expect(readViewMode("alpha")).toBeNull();
    expect(readNotesOpen("alpha")).toBeNull();
  });

  test("writers no-op when localStorage.setItem throws", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => writeArchiveMode("alpha", "on")).not.toThrow();
    expect(() => writeViewMode("alpha", "list")).not.toThrow();
    expect(() => writeNotesOpen("alpha", true)).not.toThrow();
  });

  test("readers and writers are safe without window", () => {
    vi.stubGlobal("window", undefined);

    expect(readArchiveMode("alpha")).toBeNull();
    expect(readViewMode("alpha")).toBeNull();
    expect(readNotesOpen("alpha")).toBeNull();
    expect(() => writeArchiveMode("alpha", "on")).not.toThrow();
    expect(() => writeViewMode("alpha", "list")).not.toThrow();
    expect(() => writeNotesOpen("alpha", true)).not.toThrow();
  });

  test("DASHBOARD_SECTION_ORDER_DEFAULT contains the dashboard sections in default order", () => {
    expect(DASHBOARD_SECTION_ORDER_DEFAULT).toEqual(["snapshot", "in-progress"]);
  });

  test("readDashboardSectionOrder returns null when localStorage is empty", () => {
    expect(readDashboardSectionOrder()).toBeNull();
  });

  test("readDashboardSectionOrder returns a written dashboard section order", () => {
    writeDashboardSectionOrder(["in-progress", "snapshot"]);

    expect(readDashboardSectionOrder()).toEqual(["in-progress", "snapshot"]);
  });

  test("readDashboardSectionOrder returns null for garbage dashboard section values", () => {
    localStorage.setItem("wb.dashboard.section-order", '["bogus"]');
    expect(readDashboardSectionOrder()).toBeNull();

    localStorage.setItem("wb.dashboard.section-order", "not json");
    expect(readDashboardSectionOrder()).toBeNull();
  });
});
