/**
 * Chốt chặn tự động: **mọi lối vào từ ngoài vào đều phải được gác.**
 *
 * Lối vào ở đây có hai loại, và cả hai đều là endpoint HTTP thật mà người lạ gọi thẳng được
 * nếu biết địa chỉ:
 *
 * 1. Mỗi hàm export trong một file `"use server"` — Next.js biến từng cái thành một endpoint
 *    POST riêng. Không phải "14 file cần gác" mà là **37 hàm cần gác**.
 * 2. Mỗi `GET`/`POST`/... export trong các file `route.ts` dưới `src/app/api/`.
 *
 * ## Vì sao kiểm HÌNH DẠNG chứ không kiểm nội dung thân hàm
 *
 * Cách hiển nhiên là quét xem thân hàm có chứa `requireActor()` không. Cách đó **gần như luôn
 * xanh**: nó không phân biệt nổi "gọi luôn" với "gọi trong một nhánh `if`", không thấy được
 * `return` sớm phía trên nó, và chỉ cần một comment chứa đúng chuỗi ký tự đó là qua.
 *
 * Kiểm hình dạng thì không có kẽ hở nào: gác nằm ở chữ ký (`export const X = guardedAction(...)`),
 * nên nó chạy trước thân hàm, luôn luôn, không nhánh nào bỏ qua được.
 *
 * Đây là phép kiểm mà cả Phase 02 dựa vào. Rủi ro "sót một lối vào chưa gác" được plan xếp
 * hạng **cao**, và rà bằng mắt trên 42 lối vào là cách chắc chắn sót.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_GUARDS,
  ROUTE_GUARDS,
  NOT_YET_GUARDED,
  UNGUARDED_ROUTES_BY_DESIGN,
} from "./entry-point-guard-names";

const SRC_DIR = path.join(process.cwd(), "src");

/** Phương thức HTTP mà Next.js nhận làm route handler. */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

interface SourceFile {
  /** Đường dẫn tương đối từ gốc dự án, dùng trong thông báo lỗi. */
  relativePath: string;
  content: string;
}

function walkTypeScriptFiles(dir: string): SourceFile[] {
  const found: SourceFile[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...walkTypeScriptFiles(full));
      continue;
    }
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".test.ts")) continue;

    found.push({
      relativePath: path.relative(process.cwd(), full).replace(/\\/g, "/"),
      content: readFileSync(full, "utf8"),
    });
  }

  return found;
}

/** File có chỉ thị `"use server"` ở đầu — mọi export của nó là endpoint. */
function isServerActionFile(file: SourceFile): boolean {
  return /^\s*["']use server["']/m.test(file.content);
}

/**
 * Tên mọi thứ được export, kèm việc nó có đúng hình dạng đã gác không.
 *
 * Bỏ qua `export interface` / `export type`: chúng bị xóa lúc biên dịch nên không phải
 * endpoint. Mọi export còn lại đều phải qua wrapper.
 */
function findUnguardedExports(content: string, guards: readonly string[]): string[] {
  const guarded = new RegExp(`^export const (\\w+)\\s*=\\s*(?:${guards.join("|")})\\s*[(<]`);
  const anyExport = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/;

  const unguarded: string[] = [];

  for (const line of content.split("\n")) {
    const match = anyExport.exec(line);
    if (!match) continue;
    if (guarded.test(line)) continue;

    unguarded.push(match[1]);
  }

  return unguarded;
}


/** File còn nằm trong hàng đợi chưa gác (xem `NOT_YET_GUARDED`). */
function isPending(relativePath: string): boolean {
  return (NOT_YET_GUARDED as readonly string[]).includes(relativePath);
}

describe("mọi server action đều được gác", () => {
  const actionFiles = walkTypeScriptFiles(SRC_DIR).filter(isServerActionFile);

  it("tìm thấy các file 'use server' — phép quét không âm thầm quét vào chỗ trống", () => {
    // Không có phép kiểm này thì một lỗi đường dẫn biến cả bộ test thành xanh giả: quét 0 file
    // thì 0 vi phạm, và không có gì nói rằng nó vừa ngừng bảo vệ.
    expect(actionFiles.length).toBeGreaterThan(5);
  });

  it.each(
    walkTypeScriptFiles(SRC_DIR)
      .filter(isServerActionFile)
      .map((file) => [file.relativePath, file] as const),
  )("%s", (_name, file) => {
    if (isPending(file.relativePath)) return;
    const unguarded = findUnguardedExports(file.content, ACTION_GUARDS);

    expect(
      unguarded,
      `${file.relativePath} có export chưa gác: ${unguarded.join(", ")}\n\n` +
        `Trong file "use server", MỌI hàm export là một endpoint POST riêng mà người lạ gọi\n` +
        `thẳng được. Bọc lại bằng một trong: ${ACTION_GUARDS.join(" / ")}\n\n` +
        `  export const tenHam = guardedAction(async (actor, thamSo) => { ... });\n\n` +
        `Đừng sửa bằng cách thêm "await requireActor()" vào đầu thân hàm — dòng đó quên được\n` +
        `và lách được (nằm trong nhánh if), nên phép kiểm này cố ý không chấp nhận.`,
    ).toEqual([]);
  });
});

describe("mọi route handler đều được gác", () => {
  const routeFiles = walkTypeScriptFiles(SRC_DIR).filter(
    (file) =>
      file.relativePath.endsWith("/route.ts") &&
      !UNGUARDED_ROUTES_BY_DESIGN.includes(
        file.relativePath as (typeof UNGUARDED_ROUTES_BY_DESIGN)[number],
      ),
  );

  it("tìm thấy các route handler", () => {
    expect(routeFiles.length).toBeGreaterThan(3);
  });

  it.each(routeFiles.map((file) => [file.relativePath, file] as const))("%s", (_name, file) => {
    if (isPending(file.relativePath)) return;
    const unguarded = findUnguardedExports(file.content, ROUTE_GUARDS).filter((name) =>
      HTTP_METHODS.includes(name),
    );

    expect(
      unguarded,
      `${file.relativePath} có phương thức chưa gác: ${unguarded.join(", ")}\n\n` +
        `Bọc lại bằng một trong: ${ROUTE_GUARDS.join(" / ")}\n\n` +
        `  export const POST = guardedRoute(async (actor, request: Request) => { ... });\n\n` +
        `Giữ nguyên lớp isSameOrigin đang có — nó chống CSRF, còn lớp này kiểm danh tính.\n` +
        `Hai lớp chặn hai nhóm tấn công khác nhau, không thay thế nhau được.`,
    ).toEqual([]);
  });
});

describe("hàng đợi chưa gác chỉ được rút ngắn, không được phình ra", () => {
  const all = walkTypeScriptFiles(SRC_DIR);

  it.each(NOT_YET_GUARDED)("%s vẫn còn tồn tại", (relativePath) => {
    expect(
      all.some((file) => file.relativePath === relativePath),
      `${relativePath} có trong NOT_YET_GUARDED nhưng không còn trong mã nguồn.
` +
        `Đổi tên hay xóa file thì phải sửa danh sách — bỏ mặc thì danh sách nói dối về tiến độ.`,
    ).toBe(true);
  });

  it.each(NOT_YET_GUARDED)("%s thật sự vẫn chưa gác", (relativePath) => {
    const file = all.find((f) => f.relativePath === relativePath);
    if (!file) return; // phép kiểm ở trên đã báo rồi, đừng báo trùng

    const guards = relativePath.endsWith("/route.ts") ? ROUTE_GUARDS : ACTION_GUARDS;
    const unguarded = findUnguardedExports(file.content, guards).filter(
      (name) => !relativePath.endsWith("/route.ts") || HTTP_METHODS.includes(name),
    );

    expect(
      unguarded.length,
      `${relativePath} đã gác xong rồi — XÓA nó khỏi NOT_YET_GUARDED.

` +
        `Danh sách đó là hàng đợi việc có hạn chót (bỏ cờ -H ở bước cuối Phase 02), không phải
` +
        `danh sách miễn trừ. Để tên đã xong nằm lại là che mất tiến độ thật.`,
    ).toBeGreaterThan(0);
  });
});
