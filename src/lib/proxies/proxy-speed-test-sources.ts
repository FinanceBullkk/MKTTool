/**
 * Nơi tải file thử để đo băng thông, theo thứ tự ưu tiên.
 *
 * Điều kiện bắt buộc: phục vụ qua **HTTP thường cổng 80, không chuyển hướng sang HTTPS**.
 * Bộ đo đi bằng socket trần nên không nói được TLS, mà một cú `301 → https://` thì chỉ tải về
 * 162 byte trang chuyển hướng rồi báo "tốc độ 0,3 Mbps" — sai mà trông vẫn như một số đo thật.
 *
 * Đo thật ngày 04/08/2026: `proof.ovh.net` trả 301 sang HTTPS (loại), `thinkbroadband.com`
 * đóng kết nối không trả lời (loại). Hai nhà dưới đây trả 200 kèm `Content-Length` đúng.
 */

export interface SpeedTestSource {
  host: string;
  /** Đường dẫn file thử. Nhận ngân sách byte vì có nhà cho chọn đúng cỡ, có nhà chỉ có file cố định. */
  path(budgetBytes: number): string;
}

export const SPEED_TEST_SOURCES: SpeedTestSource[] = [
  {
    // Chọn được đúng số byte cần lấy, nên không bao giờ tải thừa quota của proxy.
    host: "speed.cloudflare.com",
    path: (budgetBytes) => `/__down?bytes=${budgetBytes}`,
  },
  {
    // Chốt chặn: chỉ có file cỡ cố định. Lấy file lớn hơn ngân sách rồi cắt kết nối giữa chừng —
    // phần chưa tải thì proxy chưa tính tiền.
    host: "speedtest.tele2.net",
    path: (budgetBytes) => (budgetBytes <= 1_048_576 ? "/1MB.zip" : "/10MB.zip"),
  },
];
