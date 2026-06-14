import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { formatShortDate } from "@/lib/utils";

const originalTz = process.env.TZ;

beforeAll(() => {
  // A negative-offset zone: without UTC formatting, a UTC-midnight value would
  // render as the previous calendar day here.
  process.env.TZ = "America/Los_Angeles";
});

afterAll(() => {
  process.env.TZ = originalTz;
});

describe("formatShortDate", () => {
  test("renders the stored calendar day regardless of local timezone", () => {
    expect(formatShortDate("2026-06-13T00:00:00.000Z")).toBe("Jun 13");
  });

  test("returns null for an empty value", () => {
    expect(formatShortDate(null)).toBeNull();
  });
});
