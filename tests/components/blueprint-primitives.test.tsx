// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BlueprintButton } from "@/components/blueprint/button";
import { BlueprintCheckbox } from "@/components/blueprint/checkbox";
import { Field } from "@/components/blueprint/field";
import { PageTitle } from "@/components/blueprint/page-title";
import { BlueprintPillToggle } from "@/components/blueprint/pill-toggle";

afterEach(cleanup);

describe("BlueprintCheckbox", () => {
  test("renders a description without a label", () => {
    render(<BlueprintCheckbox description="Include archived tasks" />);

    expect(screen.getByText("Include archived tasks")).toBeDefined();
    expect(screen.getByRole("checkbox").getAttribute("aria-label")).toBeNull();
  });
});

describe("BlueprintButton", () => {
  test("renders its child element when asChild is enabled", () => {
    render(
      <BlueprintButton asChild>
        <a href="/docs">Read the docs</a>
      </BlueprintButton>,
    );

    expect(screen.getByRole("link", { name: "Read the docs" }).getAttribute("href")).toBe(
      "/docs",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("applies the accent treatment", () => {
    render(<BlueprintButton variant="accent">Continue</BlueprintButton>);

    expect(screen.getByRole("button", { name: "Continue" }).className).toContain(
      "blueprint-fill-accent",
    );
  });
});

describe("Field", () => {
  test("renders its description when no error is present", () => {
    const { container } = render(
      <Field description="Shown on the public profile" htmlFor="name" label="Name">
        <input id="name" />
      </Field>,
    );

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByText("Shown on the public profile").tagName).toBe("P");
    expect(container.querySelector("p.text-danger")).toBeNull();
  });
});

describe("PageTitle", () => {
  test("renders without an eyebrow", () => {
    const { container } = render(<PageTitle title="Planning dashboard" />);

    expect(screen.getByRole("heading", { name: "Planning dashboard" })).toBeDefined();
    expect(container.querySelector(".blueprint-eyebrow")).toBeNull();
  });
});

describe("BlueprintPillToggle", () => {
  test("renders its label", () => {
    render(
      <BlueprintPillToggle
        label="Theme"
        onChange={vi.fn()}
        options={[
          { label: "Day", value: "day" },
          { label: "Night", value: "night" },
        ]}
        value="day"
      />,
    );

    expect(screen.getByText("Theme")).toBeDefined();
  });
});
