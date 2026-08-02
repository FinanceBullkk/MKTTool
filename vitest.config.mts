import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Database tạm cho test chạm database.
 *
 * Cố ý viết lại đường dẫn ở đây thay vì nhập hằng từ vitest.global-setup.ts: nhập file .ts
 * vào config làm Vite nạp nó bằng bộ nạp CommonJS và cảnh báo mỗi lượt chạy.
 * Lệch đường dẫn giữa hai file thì test đỏ ngay ở câu truy vấn đầu tiên (bảng không tồn tại),
 * không có kiểu xanh giả.
 *
 * → Đổi ở đây thì đổi cả TEST_DB_FILE trong vitest.global-setup.ts.
 */
const TEST_DATABASE_URL = `file:${fileURLToPath(
  new URL("./.test-tmp/rules-test.db", import.meta.url),
).replace(/\\/g, "/")}`;

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
     * Các file `*.database.test.ts` dùng chung đúng một file SQLite tạm và mỗi file đều
     * `deleteMany()` để bắt đầu từ bảng sạch. Chạy song song thì file này xóa mất dữ liệu
     * seed của file kia — test đỏ ngẫu nhiên, mỗi lượt một chỗ khác nhau, và cái đắt nhất
     * là nó dạy người đọc quen với việc "chạy lại là xanh".
     *
     * Cả bộ chỉ mất thêm vài giây, đổi lại loại hẳn một lớp test chập chờn.
     */
    fileParallelism: false,
    // Dựng database tạm một lần cho cả lượt chạy, xóa khi xong.
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      // prisma-client.ts đọc DATABASE_URL ngay lúc import, không phải lúc gọi truy vấn —
      // nên phải đặt ở đây chứ không đặt trong beforeAll.
      DATABASE_URL: TEST_DATABASE_URL,
    },
  },
});
