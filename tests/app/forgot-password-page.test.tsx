// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import ForgotPasswordPage, { metadata } from "@/app/forgot-password/page";

afterEach(() => {
  cleanup();
});

describe("ForgotPasswordPage", () => {
  test("is marked noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  test("renders the reset-request form", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByText("Reset access")).toBeTruthy();
  });
});
