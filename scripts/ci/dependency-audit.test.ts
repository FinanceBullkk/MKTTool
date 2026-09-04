import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Deliberately `.test.ts`, not `.test.cjs`: vitest only collects `*.test.ts`, so the `.test.cjs`
// files beside this one are never executed by anything.
const require = createRequire(import.meta.url);
const { classify } = require("./dependency-audit.cjs") as {
  classify: (payload: unknown) => { status: string; reason: string };
};

describe("dependency audit verdict", () => {
  it("passes when nothing high or critical reaches production", () => {
    const verdict = classify({ vulnerabilities: {} });
    expect(verdict.status).toBe("PASS");
  });

  it("passes over lower-severity findings rather than training people to bypass the gate", () => {
    const verdict = classify({ vulnerabilities: { tar: { name: "tar", severity: "moderate" } } });
    expect(verdict.status).toBe("PASS");
    expect(verdict.reason).toContain("1 lower-severity entry");
  });

  it("fails on a high advisory and names the package", () => {
    const verdict = classify({ vulnerabilities: { mysql2: { name: "mysql2", severity: "high" } } });
    expect(verdict.status).toBe("FAIL");
    expect(verdict.reason).toContain("mysql2");
  });

  it("fails on a critical advisory", () => {
    const verdict = classify({ vulnerabilities: { ws: { name: "ws", severity: "critical" } } });
    expect(verdict.status).toBe("FAIL");
  });

  // The distinction that matters: npm exits 1 for both, but "could not check" is not "found
  // nothing". BLOCKED keeps the gate red while saying which fact it is.
  it("blocks rather than fails when the advisory endpoint does not answer", () => {
    const verdict = classify({ error: { summary: "503 Service Unavailable" } });
    expect(verdict.status).toBe("BLOCKED");
    expect(verdict.reason).toContain("503");
  });

  it("blocks on unparsable output rather than reading it as clean", () => {
    expect(classify(null).status).toBe("BLOCKED");
    expect(classify("not json").status).toBe("BLOCKED");
  });
});
