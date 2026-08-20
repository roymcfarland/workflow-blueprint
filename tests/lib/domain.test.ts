import { describe, expect, test } from "vitest";

import { boardStatuses, statusFromToggle } from "@/lib/domain";

describe("statusFromToggle", () => {
  test("includes archived statuses only when requested", () => {
    expect(statusFromToggle(true)).toBe(boardStatuses);
    expect(statusFromToggle(false)).toEqual([
      "ICE_BOX",
      "ON_DECK",
      "IN_PROGRESS",
      "DONE",
    ]);
  });
});
