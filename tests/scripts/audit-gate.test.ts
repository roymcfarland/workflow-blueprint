import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateAudit, exceptions, parseAuditOutput, runAudit } from "../../scripts/audit-gate";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const now = new Date("2026-10-03T12:00:00Z");
const exceptedId = "GHSA-vfj7-8cjw-p6xm";
const otherId = "GHSA-aaaa-bbbb-cccc";

function advisory(id = exceptedId, severity = "high") {
  return { url: `https://github.com/advisories/${id}`, severity, range: "<=3.0.3", source: 1240992 };
}

function report(via: unknown[] = [advisory()], pkg = "braces") {
  return { vulnerabilities: { [pkg]: { severity: "high", via } } };
}

function mockAudit(stdout: string, status: number | null = 1, extra = {}) {
  vi.mocked(spawnSync).mockReturnValue({
    pid: 1, output: [], stderr: "", stdout, status, signal: null, ...extra,
  } as unknown as ReturnType<typeof spawnSync>);
}

afterEach(() => vi.restoreAllMocks());

describe("evaluateAudit", () => {
  it("passes a clean report", () => {
    expect(evaluateAudit({ vulnerabilities: {} }, exceptions, now)).toEqual({
      ok: true, blocking: [], tolerated: [], expired: [],
    });
  });

  it("tolerates and lists only the excepted advisory", () => {
    const result = evaluateAudit(report(), exceptions, now);
    expect(result.ok).toBe(true);
    expect(result.blocking).toEqual([]);
    expect(result.tolerated).toEqual([expect.objectContaining({ id: exceptedId, package: "braces", exception: exceptions[0] })]);
  });

  it("blocks a different high advisory alongside the excepted advisory", () => {
    const result = evaluateAudit({ vulnerabilities: {
      braces: { via: [advisory()] },
      another: { via: [advisory(otherId)] },
    } }, exceptions, now);
    expect(result.ok).toBe(false);
    expect(result.blocking).toEqual([expect.objectContaining({ id: otherId, package: "another" })]);
    expect(result.tolerated).toHaveLength(1);
  });

  it("blocks a different advisory on the same package", () => {
    const result = evaluateAudit(report([advisory(), advisory(otherId)]), exceptions, now);
    expect(result.ok).toBe(false);
    expect(result.blocking.map((entry) => entry.id)).toEqual([otherId]);
    expect(result.tolerated).toHaveLength(1);
  });

  it("does not apply the exception to another package", () => {
    expect(evaluateAudit(report([advisory()], "another"), exceptions, now).ok).toBe(false);
  });

  it("blocks critical advisories", () => {
    const result = evaluateAudit(report([advisory(otherId, "critical")]), exceptions, now);
    expect(result.ok).toBe(false);
    expect(result.blocking).toEqual([expect.objectContaining({ id: otherId, severity: "critical" })]);
  });

  it.each(["moderate", "low", "info"])("ignores %s advisories", (severity) => {
    const result = evaluateAudit(report([advisory(otherId, severity)]), exceptions, now);
    expect(result.ok).toBe(true);
    expect(result.blocking).toEqual([]);
    expect(result.tolerated).toEqual([]);
  });

  it("blocks an expired exception and names it", () => {
    const result = evaluateAudit(report(), exceptions, new Date("2026-12-02T00:00:00Z"));
    expect(result.ok).toBe(false);
    expect(result.tolerated).toEqual([]);
    expect(result.blocking.map((entry) => entry.id)).toEqual([exceptedId]);
    expect(result.expired).toEqual([exceptions[0]]);
  });

  it("keeps the exception valid through its expiry date in UTC", () => {
    expect(evaluateAudit(report(), exceptions, new Date("2026-12-01T23:59:59.999Z")).ok).toBe(true);
  });

  it("does not count string-only via entries as advisories", () => {
    expect(evaluateAudit(report(["braces", "micromatch"], "fast-glob"), exceptions, now)).toEqual({
      ok: true, blocking: [], tolerated: [], expired: [],
    });
  });

  it("deduplicates repeated advisory objects and ignores propagation", () => {
    const result = evaluateAudit(report(["braces", advisory(), advisory()]), exceptions, now);
    expect(result.ok).toBe(true);
    expect(result.tolerated).toHaveLength(1);
  });

  it("blocks high advisories without a recognized GHSA URL", () => {
    const result = evaluateAudit(report([{ severity: "high", url: "https://example.com/advisory" }]), exceptions, now);
    expect(result.ok).toBe(false);
    expect(result.blocking).toHaveLength(1);
  });

  it.each([
    null, [], {}, { vulnerabilities: null }, { vulnerabilities: [] },
    { vulnerabilities: {}, error: { code: "EAUDITNOLOCK" } },
    { vulnerabilities: { braces: {} } }, report([null]), report([{}]),
    report([{ url: "https://example.com/advisory", severity: "unknown" }]),
  ])("fails closed on malformed or error reports: %j", (input) => {
    expect(() => evaluateAudit(input, exceptions, now)).toThrow(/npm audit/);
  });

  it("rejects invalid dates and exception expiry", () => {
    expect(() => evaluateAudit(report(), exceptions, new Date("invalid"))).toThrow(/invalid current date/);
    expect(() => evaluateAudit(report(), [{ ...exceptions[0], expires: "invalid" }], now)).toThrow(/Invalid expiry/);
  });
});

describe("audit CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it("spawns npm without a shell and prints the tolerated advisory despite audit exit 1", () => {
    mockAudit(JSON.stringify(report()));
    expect(runAudit()).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith("npm", ["audit", "--json"], expect.objectContaining({ shell: false }));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`TOLERATED ${exceptedId}`));
  });

  it("passes a valid clean audit with exit 0", () => {
    mockAudit('{"vulnerabilities":{}}', 0);
    expect(runAudit()).toBe(0);
    expect(console.log).toHaveBeenCalledWith("Audit gate passed: 0 blocking, 0 tolerated.");
  });

  it("prints and fails on a different high advisory", () => {
    mockAudit(JSON.stringify(report([advisory(), advisory(otherId)])));
    expect(runAudit()).toBe(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`BLOCKING ${otherId}`));
  });

  it("prints the expired exception and fails", () => {
    vi.setSystemTime(new Date("2026-12-02T00:00:00Z"));
    mockAudit(JSON.stringify(report()));
    expect(runAudit()).toBe(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`EXPIRED ${exceptedId}`));
  });

  it.each(["", " ", "not JSON", "{", "{}", '{"vulnerabilities":{},"error":{"code":"E500"}}'])
  ("fails closed on unusable stdout: %j", (stdout) => {
    mockAudit(stdout);
    expect(runAudit()).toBe(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Audit gate failed:"));
  });

  it.each([
    { status: 2 }, { status: null }, { signal: "SIGTERM" }, { error: new Error("ENOENT") },
  ])("fails closed when npm could not run: %j", (extra) => {
    mockAudit('{"vulnerabilities":{}}', 0, extra);
    expect(runAudit()).toBe(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Could not run npm audit"));
  });

  it("rejects empty and non-JSON output before evaluating", () => {
    expect(() => parseAuditOutput("")).toThrow(/empty stdout/);
    expect(() => parseAuditOutput("not JSON")).toThrow(/non-JSON stdout/);
  });
});
