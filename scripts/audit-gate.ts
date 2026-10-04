import { spawnSync } from "node:child_process";

export type AuditException = {
  id: string;
  package: string;
  reason: string;
  expires: string;
};

type Advisory = {
  id: string;
  package: string;
  severity: string;
  url: string;
};

export const exceptions: readonly AuditException[] = [
  {
    id: "GHSA-vfj7-8cjw-p6xm",
    package: "braces",
    reason:
      "No patched version; dev-only via eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces; not in npm ls --omit=dev.",
    expires: "2026-12-01",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAuditOutput(stdout: string): unknown {
  if (!stdout.trim()) {
    throw new Error("npm audit returned empty stdout.");
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("npm audit returned non-JSON stdout.");
  }
}

export function evaluateAudit(
  report: unknown,
  allowed: readonly AuditException[],
  now: Date,
) {
  if (!isRecord(report)) {
    throw new Error("npm audit returned a malformed report.");
  }
  if ("error" in report) {
    throw new Error("npm audit returned an error report.");
  }
  if (!isRecord(report.vulnerabilities)) {
    throw new Error("npm audit report is missing a vulnerabilities object.");
  }
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Audit gate received an invalid current date.");
  }

  // Expiry dates are inclusive UTC calendar dates.
  const expired = allowed.filter((exception) => {
    const end = Date.parse(`${exception.expires}T23:59:59.999Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.expires) || !Number.isFinite(end)) {
      throw new Error(`Invalid expiry for exception ${exception.id}.`);
    }
    return now.getTime() > end;
  });
  const advisories = new Map<string, Advisory>();
  for (const [pkg, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!isRecord(vulnerability) || !Array.isArray(vulnerability.via)) {
      throw new Error(`Malformed npm audit vulnerability entry: ${pkg}.`);
    }
    for (const via of vulnerability.via) {
      if (typeof via === "string") continue;
      if (
        !isRecord(via) ||
        typeof via.url !== "string" ||
        !["info", "low", "moderate", "high", "critical"].includes(String(via.severity))
      ) {
        throw new Error(`Malformed npm audit advisory entry: ${pkg}.`);
      }
      if (via.severity !== "high" && via.severity !== "critical") continue;

      // Unknown identifiers remain blocking; they can never match a GHSA exception.
      const id = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/.exec(via.url)?.[1] ?? via.url;
      advisories.set(`${id}:${pkg}`, {
        id,
        package: pkg,
        severity: String(via.severity),
        url: via.url,
      });
    }
  }

  const blocking: Advisory[] = [];
  const tolerated: (Advisory & { exception: AuditException })[] = [];
  for (const advisory of advisories.values()) {
    const exception = allowed.find(
      (entry) => entry.id === advisory.id && entry.package === advisory.package && !expired.includes(entry),
    );
    if (exception) tolerated.push({ ...advisory, exception });
    else blocking.push(advisory);
  }
  return { ok: blocking.length === 0, blocking, tolerated, expired };
}

export function runAudit(): number {
  try {
    const result = spawnSync("npm", ["audit", "--json"], {
      encoding: "utf8",
      shell: false,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error || result.signal || result.status === null || result.status > 1) {
      throw new Error("Could not run npm audit successfully.");
    }
    const evaluation = evaluateAudit(parseAuditOutput(result.stdout), exceptions, new Date());
    for (const exception of evaluation.expired) {
      console.log(`EXPIRED ${exception.id} (${exception.package}): exception expired ${exception.expires}.`);
    }
    for (const advisory of evaluation.tolerated) {
      console.log(`TOLERATED ${advisory.id} (${advisory.package}, ${advisory.severity}) until ${advisory.exception.expires}: ${advisory.exception.reason}`);
    }
    for (const advisory of evaluation.blocking) {
      console.log(`BLOCKING ${advisory.id} (${advisory.package}, ${advisory.severity}): ${advisory.url}`);
    }
    console.log(`Audit gate ${evaluation.ok ? "passed" : "failed"}: ${evaluation.blocking.length} blocking, ${evaluation.tolerated.length} tolerated.`);
    return evaluation.ok ? 0 : 1;
  } catch (error) {
    console.log(`Audit gate failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return 1;
  }
}

// tsx runs this repository's scripts as CommonJS; imports must not run the CLI.
if (typeof require !== "undefined" && require.main === module) {
  process.exitCode = runAudit();
}
