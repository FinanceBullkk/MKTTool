/**
 * Thư mục cầu nối để dữ liệu của nó: khóa riêng của máy và file cấu hình.
 *
 * ## Cạnh `.exe`, không phải trong `%APPDATA%`
 *
 * Người cài là kỹ thuật viên ngồi remote desktop ở GĐ6, và việc họ phải làm trên từng máy là
 * *"dán ba giá trị vào một file"*. Một thư mục ẩn sâu trong hồ sơ người dùng biến việc đó thành
 * đi tìm đường dẫn; cạnh `.exe` thì mở thư mục vừa chép file vào là thấy.
 *
 * Đổi lại: cài `.exe` vào `C:\Program Files` sẽ không ghi được. Đó là lý do `setup.bat` chép vào
 * thư mục người dùng chứ không vào Program Files.
 *
 * ## Vì sao có `RELAY_HOME`
 *
 * Lúc chạy dưới `tsx` để phát triển, `process.execPath` là `node.exe` nằm ở chỗ cài Node —
 * không ai muốn ghi khóa và cấu hình vào đó. Biến môi trường này là đường thoát, và cũng là
 * cách chạy hai cầu nối giả cạnh nhau trong test.
 */
import path from "node:path";

/** Khóa riêng X25519 của máy. Cầu nối tự sinh, **không ai sửa tay**. */
export const DEVICE_KEY_FILE = "relay-device-key.json";

/**
 * Ba giá trị người cài dán vào. Tách khỏi file khóa có chủ ý — hai file hỏng theo hai kiểu và
 * cách sửa khác hẳn nhau: mất file khóa nghĩa là phải **đăng ký lại máy** trên web, còn sai file
 * cấu hình thì chỉ là sửa lại một dòng.
 */
export const CONFIG_FILE = "relay-config.json";

/**
 * Thư mục dữ liệu của cầu nối.
 *
 * `execPath` nhận qua tham số thay vì đọc thẳng `process.execPath`, để test dựng được cảnh
 * "chạy từ .exe ở thư mục X" mà không phải giả lập cả tiến trình.
 */
export function resolveRelayHome(
  env: Partial<Record<string, string>> = process.env,
  execPath: string = process.execPath,
): string {
  const override = env.RELAY_HOME?.trim();
  if (override) return path.resolve(override);

  return path.dirname(execPath);
}

/** Đường dẫn đầy đủ tới một file dữ liệu của cầu nối. */
export function relayFilePath(fileName: string, home: string = resolveRelayHome()): string {
  return path.join(home, fileName);
}
