import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.mts";

/**
 * Cấu hình cho lane Windows.
 *
 * `vitest.config.mts` cài một global setup xoá sạch schema của một Postgres thật rồi áp lại
 * migration. Điều đó là bắt buộc với `*.database.test.ts`, nhưng không dựng được trên runner
 * Windows — đó chính là lý do `check` phải ở Linux có Docker — và `relay/` thì không mở database
 * nào. Global setup chạy vô điều kiện, không phụ thuộc việc lọc file, nên chỉ giới hạn `include`
 * là không đủ: phải bỏ hẳn nó ở đây.
 *
 * Đây là thứ cho phép các test `skipIf(process.platform !== "win32")` của Relay chạy được trên CI.
 */
const { test, ...rest } = baseConfig as { test: Record<string, unknown> };

export default defineConfig({
  ...rest,
  test: {
    ...test,
    include: ["relay/**/*.test.ts"],
    globalSetup: [],
  },
});
