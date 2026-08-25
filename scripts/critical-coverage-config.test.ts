import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sàn coverage chỉ tồn tại nếu (1) danh sách module được bảo vệ không bị bào mòn, và (2) có một
 * lệnh trong CI thật sự chạy nó.
 *
 * Bài học đã trả giá của dự án: "một check chưa chứng minh được là có chạy trong môi trường
 * artifact của nó thì coi như không tồn tại". Bộ test này là chỗ chứng minh cho sàn coverage.
 */

const REPO_ROOT = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/** Ngưỡng không bao giờ được đặt thấp hơn các mức này, dù baseline tương lai đo ra bao nhiêu. */
const ABSOLUTE_FLOORS = { lines: 70, branches: 60, functions: 70, statements: 70 };

/**
 * Từng thư mục kèm lý do được bảo vệ. Lý do không phải để trang trí: sau này ai đề xuất bỏ một
 * dòng khỏi danh sách thì phải trả lời được câu đó.
 */
const PROTECTED_AREAS: ReadonlyArray<readonly [string, string]> = [
  ["src/lib/auth/**/*.ts", "quyết định ai được làm gì"],
  ["src/lib/crypto/**/*.ts", "mã hoá hai lớp cho mật khẩu và TOTP"],
  ["src/lib/tickets/**/*.ts", "ký vé Ed25519 cho phép mở profile"],
  ["src/lib/relay/**/*.ts", "ranh giới tin cậy giữa Web và máy vận hành"],
  ["src/lib/release/**/*.ts", "thẩm quyền phát hành và bản tương thích"],
  ["src/lib/proxies/**/*.ts", "một nick một IP tĩnh, không dùng chung"],
  ["src/lib/enrollment/**/*.ts", "gắn thiết bị với đúng người chịu trách nhiệm"],
  ["src/lib/antidetect/**/*.ts", "quyền sở hữu profile trên máy vận hành"],
];

describe("hợp đồng sàn coverage đường trọng yếu", () => {
  const config = read("vitest.config.mts");

  it("giữ đủ các vùng mà lỗi ở đó xuyên qua ranh giới danh tính", () => {
    for (const [glob, reason] of PROTECTED_AREAS) {
      expect(config, `${glob} (${reason}) phải nằm dưới sàn coverage`).toContain(`"${glob}"`);
    }
  });

  it("đo code chạy thật, không đếm chính bộ test", () => {
    // Đếm cả file test thì mọi con số đều đẹp lên mà không bảo vệ thêm được gì.
    expect(config).toContain('exclude: ["**/*.test.ts"]');
  });

  it("khai báo ngưỡng, và không ngưỡng nào nằm dưới sàn tuyệt đối", () => {
    for (const [metric, floor] of Object.entries(ABSOLUTE_FLOORS)) {
      const match = config.match(new RegExp(`${metric}:\\s*(\\d+)`));
      expect(match, `thiếu ngưỡng cho ${metric}`).not.toBeNull();

      const value = Number(match![1]);
      expect(
        value,
        `ngưỡng ${metric} là ${value}, dưới sàn tuyệt đối ${floor}. Baseline tụt xuống mức này ` +
          `là lý do để viết thêm test, không phải lý do để hạ sàn.`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });

  it("được một lệnh trong CI gọi thật, không nằm im trong config", () => {
    expect(read("package.json")).toContain('"test:critical-coverage": "vitest run --coverage"');
    expect(read(".github/workflows/ci.yml")).toContain("run: npm run test:critical-coverage");
  });

  it("routes CI jobs only to approved self-hosted runner pools", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).not.toMatch(/\b(?:ubuntu|windows|macos)-latest\b/i);

    const runsOn = [...workflow.matchAll(/^\s*runs-on:\s*(.+)$/gm)].map((match) => match[1]);
    expect(runsOn).toHaveLength(3);
    expect(runsOn.filter((value) => value === "[self-hosted, Linux, X64]")).toHaveLength(2);
    expect(runsOn.filter((value) => value === "[self-hosted, Windows, X64]")).toHaveLength(1);
  });
});
