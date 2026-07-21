// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const profileFormMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/components/profile-form", () => ({
  ProfileForm: (props: Record<string, unknown>) => {
    profileFormMock(props);

    return <div data-testid="profile-form" />;
  },
}));

import ProfilePage from "@/app/(app)/profile/page";
import { requireCurrentUser } from "@/lib/auth";

beforeEach(() => {
  profileFormMock.mockReset();
  vi.mocked(requireCurrentUser).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ProfilePage", () => {
  test("renders ProfileForm with the authenticated user", async () => {
    const user = {
      email: "alex@example.com",
      id: "user-1",
      name: "Alex",
      themePreference: "day",
    } as never;
    vi.mocked(requireCurrentUser).mockResolvedValueOnce(user);

    render(await ProfilePage());

    expect(screen.getByTestId("profile-form")).toBeDefined();
    expect(requireCurrentUser).toHaveBeenCalledTimes(1);
    expect(profileFormMock).toHaveBeenCalledWith(expect.objectContaining({ user }));
  });
});
