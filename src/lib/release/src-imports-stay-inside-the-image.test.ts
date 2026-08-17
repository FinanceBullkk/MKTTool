/**
 * Không file nào dưới `src/` được import ra ngoài những thư mục **có mặt trong Docker image**.
 *
 * ## Vì sao cần một bài test riêng cho chuyện này
 *
 * Ngày 17/08/2026, `relay-compatibility-manifest-file.ts` import một file JSON nằm dưới `plans/`.
 * Dưới máy lập trình thư mục đó luôn có, nên **mọi phép kiểm đều xanh**: `tsc --noEmit` xanh,
 * toàn bộ bộ test xanh, CI xanh, và ngay cả `npm run build` dưới máy cũng xanh. Chỗ duy nhất nó
 * đổ là lượt build trong Docker trên Railway — tức là **sau khi đã merge vào `master`**, ở đúng
 * chỗ đắt nhất để phát hiện.
 *
 * `Dockerfile` chỉ copy `src`, `scripts`, `prisma` cùng vài file cấu hình ở gốc. `plans/`, `docs/`
 * và `relay/` **không** vào image. Một import trỏ ra ngoài danh sách ấy là một lượt deploy hỏng,
 * và không phép kiểm nào đang có nhìn thấy nó.
 *
 * ## Vì sao kiểm bằng đường dẫn chứ không bằng cách build thử
 *
 * Build thử trong Docker mới là phép kiểm thật, nhưng nó cần Docker chạy và mất vài phút. Phép
 * kiểm này chạy trong mili giây và bắt đúng lớp lỗi đó, nên nó nằm được trong bộ test thường —
 * và một lỗi bị bắt dưới máy trong một giây thì rẻ hơn cùng lỗi đó bắt được sau khi merge.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Gốc repo, từ `src/lib/release/` đi ngược ba tầng. */
const REPO_ROOT = path.resolve(__dirname, "../../..");

/**
 * Thư mục được `Dockerfile` copy vào tầng chạy — xem các dòng `COPY … ./src`, `./scripts`,
 * `./prisma`. Sửa danh sách này khi `Dockerfile` đổi, và **chỉ khi đó**.
 */
const DIRECTORIES_IN_IMAGE = ["src", "scripts", "prisma"];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

/**
 * File test không tính, và đây là ranh giới đúng chứ không phải nới cho dễ.
 *
 * Next.js chỉ lần theo cây import bắt đầu từ route và component; file test không nằm trên cây đó
 * nên nó không bao giờ làm gãy lượt build. Chúng lại có lý do chính đáng để với sang `relay/` —
 * ví dụ `compatibility-update-actions.database.test.ts` kiểm đúng chỗ giao kèo giữa hai phía.
 * Bắt lỗi chúng là bắt nhầm, và một chốt hay bắt nhầm là một chốt sắp bị ai đó tắt đi.
 */
const TEST_FILE = /\.(test|spec)\.[cm]?tsx?$/;

/** `from "…"`, `import "…"`, và `import("…")` — chỉ quan tâm specifier tương đối. */
const RELATIVE_SPECIFIER = /(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g;

function walk(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (SOURCE_EXTENSIONS.has(path.extname(full))) {
      files.push(full);
    }
  }

  return files;
}

interface Escape {
  file: string;
  specifier: string;
  resolvesTo: string;
}

function findEscapes(): Escape[] {
  const escapes: Escape[] = [];

  for (const file of walk(path.join(REPO_ROOT, "src"))) {
    if (TEST_FILE.test(file)) continue;
    const source = readFileSyncCached(file);

    for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
      const specifier = match[1];
      const resolved = path.resolve(path.dirname(file), specifier);
      const fromRoot = path.relative(REPO_ROOT, resolved).replace(/\\/g, "/");

      const insideImage = DIRECTORIES_IN_IMAGE.some(
        (dir) => fromRoot === dir || fromRoot.startsWith(`${dir}/`),
      );

      if (!insideImage) {
        escapes.push({
          file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
          specifier,
          resolvesTo: fromRoot,
        });
      }
    }
  }

  return escapes;
}

/** Đọc một lần cho mỗi file — phép quét chạm vào vài trăm file. */
const cache = new Map<string, string>();
function readFileSyncCached(file: string): string {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;
  const content = readFileSync(file, "utf8");
  cache.set(file, content);
  return content;
}

describe("mọi import dưới src/ phải trỏ vào thứ có trong Docker image", () => {
  it("không có import nào thoát ra ngoài src/, scripts/, prisma/", () => {
    // Đỏ ở đây nghĩa là: lượt deploy tới sẽ hỏng ở bước `npm run build` trong Docker, kèm câu
    // `Module not found`. Sửa bằng cách chuyển file được import vào trong image — ĐỪNG thêm thư
    // mục vào `DIRECTORIES_IN_IMAGE` trừ khi `Dockerfile` thật sự copy nó.
    expect(findEscapes()).toEqual([]);
  });

  it("phép quét thật sự nhìn thấy import — không im lặng rỗng", () => {
    // Một regex hỏng biến bài trên thành xanh vĩnh viễn. Con số chỉ cần là "nhiều".
    let counted = 0;
    for (const file of walk(path.join(REPO_ROOT, "src"))) {
      counted += [...readFileSyncCached(file).matchAll(RELATIVE_SPECIFIER)].length;
    }
    expect(counted).toBeGreaterThan(100);
  });
});
