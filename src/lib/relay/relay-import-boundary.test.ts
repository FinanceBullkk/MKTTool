/**
 * Chặn `relay/` kéo cả web app vào `.exe`.
 *
 * ## Vì sao là phép kiểm hình dạng mã nguồn, không phải một test hành vi
 *
 * Kiểu hỏng này **không làm test nào đỏ**. Ai đó import `prisma` vào một file trong `relay/` để
 * tra một cái tên nick cho tiện: mọi test vẫn xanh, `npm run dev` vẫn chạy, và thứ duy nhất
 * đổi là `.exe` phồng thêm vài chục MB kèm một client database nằm im trên máy operator — đúng
 * chiếc máy mà cả kiến trúc này dựng ra để **không** có đường vào database.
 *
 * Cùng họ với `encrypted-field-registry.test.ts` và `guarded-entry-points.test.ts`: kiểu hỏng
 * nào không làm test nào đỏ thì phải có một phép kiểm nhắm thẳng vào nó.
 *
 * ## Vì sao test này nằm ở `src/`, không nằm ở `relay/`
 *
 * Để nó chạy kể cả khi ai đó sửa `vitest.config.ts` và vô tình bỏ `relay/` ra khỏi danh sách
 * test. Một phép canh biên giới mà tự nằm trong vùng nó canh thì mất cùng lúc với thứ nó canh.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RELAY_SOURCE_DIR = path.join(process.cwd(), "relay", "src");

const SHARED_RELEASE_CONTRACTS = new Set([
  "../../src/lib/release/compatibility-artifact-paths",
  "../../src/lib/release/compatibility-control-contract",
  "../../src/lib/release/compatibility-manifest",
  "../../src/lib/release/compatibility-manifest-crypto",
  "../../src/lib/release/compatibility-manifest-schema",
  "../../src/lib/release/compatibility-update-authorization",
  "../../src/lib/release/release-root-trust",
  "../../src/lib/release/rollback-authorization",
]);

/**
 * Thứ `relay/` không được đụng tới, kèm lý do — câu này đi thẳng vào thông báo test đỏ, vì
 * người đọc nó đang ở giữa một việc khác và cần biết ngay vì sao bị chặn.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  {
    pattern: /["']next(\/[^"']*)?["']/,
    why: "Next.js is not present in the .exe because Relay is not a web app.",
  },
  {
    pattern: /\/db\/prisma-client["']|["']@prisma\/client["']|["']prisma["']/,
    why:
      "Relay has NO database access. It knows only what the ticket carries down; this is why " +
      "compromising an operator PC does not expose the vault.",
  },
  {
    pattern: /["']react(-dom)?(\/[^"']*)?["']/,
    why: "The status page is string-built HTML. Adding React increases size only to add styling.",
  },
  {
    pattern: /["']@\//,
    why:
      "The `@/` alias exists only in the web app tsconfig. Relay uses a different build; use " +
      "relative paths.",
  },
  {
    pattern: /\/lib\/auth\//,
    why:
      "Relay does not decide who may read data; it only verifies signatures. Importing the " +
      "authorization layer would duplicate that decision in a second place.",
  },
];

/** Mọi file `.ts` trong `relay/src`, kể cả thư mục con. */
function relaySourceFiles(dir: string = RELAY_SOURCE_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return relaySourceFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** Chỉ soi dòng `import`/`require` — chuỗi "prisma" trong một câu chú thích không phải lỗi. */
function importLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => /^\s*(import\b|export\s+.*\bfrom\b)|require\(/.test(line));
}

describe("relay/ import boundary", () => {
  const files = relaySourceFiles();

  it("has files to inspect so the guard is not checking an empty list", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)("does not import $pattern from any relay/ file", ({ pattern, why }) => {
    const offenders = files.flatMap((file) => {
      const lines = importLines(readFileSync(file, "utf8"));
      return lines
        .filter((line) => pattern.test(line))
        .map((line) => `${path.relative(process.cwd(), file)}: ${line.trim()}`);
    });

    expect(offenders, why).toEqual([]);
  });

  it("reuses src/lib only through relative paths and approved shared directories", () => {
    // Release reuse is restricted to audited pure contract files, not the server-side directory.
    const allowedDirectory = /\.\.\/\.\.\/src\/lib\/(tickets|crypto|relay|totp|antidetect)\//;

    const offenders = files.flatMap((file) => {
      return importLines(readFileSync(file, "utf8"))
        .filter((line) => {
          const source = /["'](\.\.\/\.\.\/src\/lib\/[^"']+)["']/.exec(line)?.[1];
          return (
            source !== undefined &&
            !allowedDirectory.test(source) &&
            !SHARED_RELEASE_CONTRACTS.has(source)
          );
        })
        .map((line) => `${path.relative(process.cwd(), file)}: ${line.trim()}`);
    });

    expect(offenders).toEqual([]);
  });
});
