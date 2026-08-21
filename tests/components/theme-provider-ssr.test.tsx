// @vitest-environment node

import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ThemeProvider } from "@/components/providers/theme-provider";

describe("ThemeProvider SSR", () => {
  test("defaults to day while rendering its children without a window", () => {
    expect(typeof window).toBe("undefined");

    const html = renderToString(
      <ThemeProvider>
        <div>Server-rendered child</div>
      </ThemeProvider>,
    );

    expect(html).toContain("<div>Server-rendered child</div>");
  });
});
