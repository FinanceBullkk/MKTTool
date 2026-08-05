/**
 * Sinh một lượt dò sức khỏe ở TIẾN TRÌNH RIÊNG, rồi trả quyền điều khiển lại ngay.
 *
 * Vì sao không chạy thẳng trong web app: một lượt đầy đủ nghỉ ngẫu nhiên 30-90 giây giữa các
 * nick nên mất gần mười phút — dài hơn mọi giới hạn chờ hợp lý của một request HTTP. Đó chính
 * là lý do `api/health/run/route.ts` cố ý chỉ nhận một nick.
 *
 * Vì sao gọi lại đúng script của `npm run health` thay vì gọi `runHealthCheck()`:
 *  - không có bản sao thứ hai của luồng dò để mà lệch nhau;
 *  - tiến trình tách rời sống sót qua việc người dùng đóng tab hoặc dev server nạp lại;
 *  - `health-check-lock.ts` vốn đã chặn được đúng tình huống hai tiến trình này.
 *
 * ## Hệ quả cho môi trường chạy thật (GĐ5)
 *
 * Dòng `spawn` dưới đây làm `tsx` và toàn bộ `scripts/` + `src/` thành **thứ cần có lúc CHẠY**,
 * không phải chỉ lúc build. Ảnh Docker nào cắt chúng đi thì nút "Dò cả đàn" sinh ra một tiến
 * trình chết ngay ở dòng đầu — mà `stdio: "ignore"` nuốt sạch câu lỗi, nên người dùng chỉ thấy
 * "đã khởi động" rồi không có gì xảy ra. Đó là lý do `tsx` nằm ở `dependencies` chứ không phải
 * `devDependencies`.
 */
import { spawn } from "node:child_process";
import path from "node:path";

const RUNNER_SCRIPT = path.join("scripts", "run-health-check.ts");

export interface LaunchedHealthCheck {
  pid: number | null;
}

export function launchHealthCheckProcess(): LaunchedHealthCheck {
  const child = spawn(
    process.execPath,
    [
      // Web app đã nạp .env sẵn nên biến môi trường thừa hưởng được, nhưng nạp lại cho chắc:
      // `-if-exists` để máy chưa có .env thì bỏ qua thay vì chết ngay từ dòng lệnh.
      "--env-file-if-exists=.env",
      "--import",
      "tsx",
      RUNNER_SCRIPT,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      // Tách hẳn khỏi tiến trình cha: lượt dò mười phút không được chết theo một lần nạp lại
      // dev server. `stdio: ignore` vì không ai đọc — tiến độ đọc qua file khóa và qua chính
      // các bản ghi HealthCheck ghi dần vào database.
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );

  child.unref();
  return { pid: child.pid ?? null };
}
