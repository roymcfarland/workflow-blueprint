// @vitest-environment jsdom

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createSocialImageResponseMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/social-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social-image")>()),
  createSocialImageResponse: createSocialImageResponseMock,
}));

import OpenGraphImage, {
  alt as openGraphAlt,
  contentType as openGraphContentType,
  size as openGraphSize,
} from "@/app/opengraph-image";
import TwitterImage, {
  alt as twitterAlt,
  contentType as twitterContentType,
  size as twitterSize,
} from "@/app/twitter-image";
import { siteConfig } from "@/lib/site-config";
import { socialImageContentType, socialImageSize } from "@/lib/social-image";

beforeEach(() => {
  createSocialImageResponseMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("social image wrappers", () => {
  test("forwards the openGraph variant and re-exports the shared metadata", () => {
    const response = { variant: "openGraph" } as never;
    createSocialImageResponseMock.mockReturnValueOnce(response);

    expect(OpenGraphImage()).toBe(response);
    expect(createSocialImageResponseMock).toHaveBeenCalledWith("openGraph");
    expect(openGraphContentType).toBe(socialImageContentType);
    expect(openGraphSize).toEqual(socialImageSize);
    expect(openGraphAlt).toBe(siteConfig.socialImageAlt);
  });

  test("forwards the twitter variant and re-exports the shared metadata", () => {
    const response = { variant: "twitter" } as never;
    createSocialImageResponseMock.mockReturnValueOnce(response);

    expect(TwitterImage()).toBe(response);
    expect(createSocialImageResponseMock).toHaveBeenCalledWith("twitter");
    expect(twitterContentType).toBe(socialImageContentType);
    expect(twitterSize).toEqual(socialImageSize);
    expect(twitterAlt).toBe(siteConfig.socialImageAlt);
  });
});
