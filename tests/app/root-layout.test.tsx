// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import RootLayout from "@/app/layout";

afterEach(() => {
  cleanup();
});

describe("RootLayout", () => {
  test("renders its children through the real providers", () => {
    render(
      <RootLayout>
        <div data-testid="child">hello</div>
      </RootLayout>,
    );

    expect(screen.getByTestId("child")).toBeDefined();
  });
});
