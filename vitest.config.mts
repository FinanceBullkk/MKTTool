import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

/**
 * Lấy ĐÚNG MỘT biến ra khỏi .env, không đổ cả file vào `process.env`.
 *
 * `process.loadEnvFile()` ngắn hơn nhiều nhưng đã thử và hỏng thật: nó bơm mọi biến của máy
 * dev vào test, và `FACEBOOK_LOGIN_CONFIG_ID` lập tức đẩy `buildAuthorizeUrl` sang nhánh
 * "Login for Business" — một test đang xanh hóa đỏ chỉ vì máy chạy nó có cấu hình Facebook.
 * Chiều ngược lại còn tệ hơn: một test có thể xanh giả nhờ biến chỉ tồn tại trên một máy.
 *
 * Bộ test phải ra cùng đáp án ở mọi máy. Đó là mục đích của cả phase này, và cách nạp .env
 * cũng phải theo nguyên tắc đó.
 */
function readTestDatabaseUrl(): string {
  // Biến đặt sẵn ngoài môi trường (CI) thắng .env — CI không có file .env.
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  try {
    const parsed = parseEnv(readFileSync(path.join(process.cwd(), ".env"), "utf8"));
    return typeof parsed.TEST_DATABASE_URL === "string" ? parsed.TEST_DATABASE_URL : "";
  } catch {
    // Chưa có .env — global setup báo lỗi kèm hướng dẫn cụ thể hơn bất cứ câu nào viết ở đây.
    return "";
  }
}

/**
 * Database cho test chạm database: một Postgres THẬT, tách hẳn database vận hành.
 *
 * Cố ý KHÔNG có giá trị mặc định. Một mặc định kiểu `postgresql://postgres@localhost/mkttool_test`
 * thì trên máy người khác nó âm thầm trỏ vào một chỗ họ không ngờ tới — mà global setup XÓA SẠCH
 * schema trước mỗi lượt chạy. Thiếu biến thì dừng kèm hướng dẫn, xem `vitest.global-setup.ts`.
 */
const TEST_DATABASE_URL = readTestDatabaseUrl();

// `vitest.global-setup.ts` chạy trong tiến trình này và đọc biến qua process.env.
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;

export default defineConfig({
  // Cùng alias "@/" với tsconfig.json để test import y hệt cách code chạy thật.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /**
     * Chạy lần lượt từng file, KHÔNG song song.
     *
     * Các file `*.database.test.ts` dùng chung đúng một database Postgres và mỗi file đều
     * `deleteMany()` để bắt đầu từ bảng sạch. Chạy song song thì file này xóa mất dữ liệu
     * seed của file kia — test đỏ ngẫu nhiên, mỗi lượt một chỗ khác nhau, và cái đắt nhất
     * là nó dạy người đọc quen với việc "chạy lại là xanh".
     *
     * Cả bộ chỉ mất thêm vài giây, đổi lại loại hẳn một lớp test chập chờn.
     */
    fileParallelism: false,
    // Dựng schema test một lần cho cả lượt chạy, dọn sạch khi xong.
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      /**
       * Đặt ở đây chứ không trong `beforeAll`: `env` của vitest có mặt từ trước khi file test
       * được nạp, còn `beforeAll` chạy sau — mà chỉ cần một module nào đó chạm vào `prisma` ở
       * thân module là đã muộn.
       *
       * (Từ 05/08/2026 `prisma-client.ts` dựng client TRỄ nên nó không còn đọc biến này lúc
       * import nữa. Vẫn giữ ở đây: các test chạm database cần biến có mặt lúc truy vấn, và
       * `env` là chỗ chắc chắn sớm hơn mọi thứ khác.)
       */
      DATABASE_URL: TEST_DATABASE_URL,
      /**
       * Múi giờ team cho test. Đặt CỐ ĐỊNH và cố ý KHÔNG lấy theo máy: mục đích của cả
       * phase này là để kết quả không phụ thuộc máy nào chạy, nên bộ test cũng phải ra
       * cùng một đáp án trên máy dev ở Việt Nam lẫn trên runner CI chạy giờ UTC.
       */
      TEAM_TIMEZONE: "Asia/Ho_Chi_Minh",
    },
  },
});
