import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scanner = fileURLToPath(new URL("./secret-scan.cjs", import.meta.url));
const workflow = fileURLToPath(new URL("../../.github/workflows/secret-scan.yml", import.meta.url));
const defaultRoots = ["plans", "docs", "src", "relay", "scripts", ".github"];

function createCheckout(): string {
  const root = mkdtempSync(join(tmpdir(), "mkttool-secret-scan-"));
  for (const directory of defaultRoots) mkdirSync(join(root, directory), { recursive: true });
  return root;
}

function runScanner(root: string): string {
  return execFileSync(process.execPath, [scanner], {
    cwd: root,
    env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" },
    encoding: "utf8",
  });
}

function failedOutput(run: () => void): string {
  try {
    run();
  } catch (error) {
    return String((error as { stdout?: string | Buffer }).stdout ?? "");
  }
  throw new Error("Expected secret scan to fail.");
}

describe("secret scan", () => {
  it("scans documentation by default without printing a matched secret", () => {
    const root = createCheckout();
    try {
      const planted = ["ghp_", "abcdefghijklmnopqrstuvwxyz1234567890"].join("");
      writeFileSync(join(root, "docs", "planted.md"), `token=${planted}\n`, "utf8");

      const output = failedOutput(() => runScanner(root));

      expect(output).toContain("high-confidence credential pattern");
      expect(output).toContain("docs/planted.md");
      expect(output).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows explicit placeholder credentials in documentation", () => {
    const root = createCheckout();
    try {
      writeFileSync(
        join(root, "docs", "database-example.md"),
        "postgresql://<user>:<password>@<host>:5432/<database>\n",
        "utf8",
      );

      expect(runScanner(root)).toContain('"status":"PASS"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not let an unrelated placeholder hide a concrete credential", () => {
    const root = createCheckout();
    try {
      const password = ["Concrete", "Secret123"].join("");
      const credential = [
        "postgresql://admin:",
        password,
        "@prod.internal:5432/main (<host> is documented elsewhere)\n",
      ].join("");
      writeFileSync(
        join(root, "docs", "unsafe-example.md"),
        credential,
        "utf8",
      );

      const output = failedOutput(() => runScanner(root));

      expect(output).toContain("credentialed-database-url");
      expect(output).not.toContain(password);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("checks every credential-shaped URL on the same line", () => {
    const root = createCheckout();
    try {
      const password = ["Second", "Secret123"].join("");
      const credential = [
        "postgresql://<user>:<password>@<host>:5432/<database> or postgresql://admin:",
        password,
        "@prod.internal:5432/main\n",
      ].join("");
      writeFileSync(
        join(root, "docs", "two-examples.md"),
        credential,
        "utf8",
      );

      const output = failedOutput(() => runScanner(root));

      expect(output).toContain("credentialed-database-url");
      expect(output).not.toContain(password);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scans tracked files at the repository root, which the root list never reached", () => {
    const root = createCheckout();
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      // Built in pieces so this test file never itself contains a credential-shaped URL.
      const password = ["Root", "Secret123"].join("");
      const credential = ["db: postgresql://svc:", password, "@prod.internal:5432/app", "\n"].join("");
      // AGENTS.md, README.md, package.json and friends live here and were never in scope.
      writeFileSync(join(root, "README.md"), credential, "utf8");
      execFileSync("git", ["add", "README.md"], { cwd: root });

      const output = failedOutput(() => runScanner(root));

      expect(output).toContain("README.md");
      expect(output).not.toContain(password);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves an untracked root file alone, so .env cannot fail the gate", () => {
    const root = createCheckout();
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      const password = ["Untracked", "Secret123"].join("");
      // Never committed, so it cannot leak through git - and must not break the gate either.
      writeFileSync(
        join(root, ".env"),
        ["DATABASE_URL=postgresql://svc:", password, "@prod.internal:5432/app", "\n"].join(""),
        "utf8",
      );

      const output = runScanner(root);

      expect(output).toContain('"status":"PASS"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads this repository's own Vietnamese placeholder as a placeholder", () => {
    const root = createCheckout();
    try {
      // A gate that cannot read its own repository's examples cries wolf, and a gate that cries
      // wolf is one people learn to ignore.
      writeFileSync(
        join(root, "docs", "example.md"),
        ["postgresql://user:mật_khẩu@host:5432/ten_db", "\n",
         "postgresql://user:password@host:5432/app", "\n"].join(""),
        "utf8",
      );

      const output = runScanner(root);

      expect(output).toContain('"status":"PASS"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the hosted secret-scan scope aligned with the local default", () => {
    const source = readFileSync(workflow, "utf8");
    for (const root of defaultRoots) expect(source).toContain(`--root=${root}`);
    expect(source).not.toContain("paths-ignore");
  });
});
