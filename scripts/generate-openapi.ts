import { writeFileSync } from "node:fs";

import { stringify } from "yaml";

import { buildExternalOpenApiSpec } from "@/lib/external-openapi";

writeFileSync("docs/openapi.yaml", stringify(buildExternalOpenApiSpec()));
