import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, test } from "vitest";

import { buildExternalOpenApiSpec } from "@/lib/external-openapi";

describe("external v1 OpenAPI contract", () => {
  test("docs/openapi.yaml matches the Zod-generated external API spec", () => {
    const committedSpec = parse(
      readFileSync(join(process.cwd(), "docs/openapi.yaml"), "utf8"),
    );

    expect(committedSpec).toEqual(buildExternalOpenApiSpec());
  });
});
