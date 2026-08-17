/**
 * Nhận ra một bí mật 32 byte **điền tạm** — thứ người vận hành gõ tay cho qua chuyện.
 *
 * ## Vì sao module này tồn tại riêng
 *
 * Luật ở đây sinh ra cho hạt giống khóa ký (FINDING C2). Rồi FINDING C33 chỉ ra đúng lỗ đó ở
 * `parseVaultKey`, và cùng lúc ở ô dán khóa operator của cầu nối — ba chỗ đọc một bí mật 32 byte
 * từ tay người, cả ba chỉ kiểm độ dài và bảng chữ. Chép luật sang từng chỗ là hẹn trước ngày ba
 * bản lệch nhau, nên luật nằm ở một chỗ và cả ba gọi vào.
 *
 * ## Phạm vi: chặn sai sót của người vận hành, KHÔNG chặn kẻ tấn công
 *
 * Kẻ tấn công không điền biến môi trường của ta. Thứ có thật là: dán `00…00` cho qua lúc dựng máy
 * dev rồi để nguyên tới lúc chạy thật. Cùng lối nghĩ với việc khóa cứng ô nhập bí mật tới khi
 * hydrate xong — đặt phép chặn vào chỗ không quên được, thay vì tin rằng không ai làm thế.
 *
 * ## Vì sao chỉ bắt khuôn mẫu, không đo entropy
 *
 * Đo entropy thống kê trên 32 byte cho ra một ngưỡng vừa dễ lọt vừa dễ chặn nhầm khóa thật, mà
 * **chặn nhầm khóa thật là hỏng nặng hơn nhiều so với thứ đang phòng**: nó khóa người dùng ra
 * ngoài kho dữ liệu của chính họ. Ba luật dưới đây đều là những thứ *không bao giờ* ra từ một
 * nguồn ngẫu nhiên thật, nên xác suất dương tính giả là số không đáng nói (dưới 10^-30 cho luật
 * lỏng nhất).
 *
 * ## Chỗ luật này CỐ Ý không với tới
 *
 * Khối lặp dài hơn `MAX_CHECKED_PERIOD` byte thì lọt — ví dụ một khối 16 byte lặp hai lần. Ngưỡng
 * này giữ nguyên từ C2 và không nới ở C33: nới nó là đổi hành vi của một chốt đã kiểm chứng xong,
 * đổi lấy việc bắt thêm một khuôn mà chưa ai gõ nhầm bao giờ. `.env.example` để trống chứ không
 * cài sẵn giá trị mồi, nên chốt này là lưới thứ hai chứ không phải lưới duy nhất.
 */

/** Số byte của mọi bí mật đi qua đây. Ngưỡng bên dưới hiệu chỉnh theo đúng độ dài này. */
export const PLACEHOLDER_CHECK_BYTES = 32;

/**
 * Dưới ngần này giá trị byte khác nhau thì coi là điền tạm.
 *
 * 32 byte ngẫu nhiên thật cho ra khoảng 30 giá trị khác nhau; rơi xuống dưới 8 là chuyện xác suất
 * cỡ 10^-38. Ngưỡng đặt thấp có chủ ý: mục tiêu là bắt thứ người ta gõ tay, không phải chấm điểm
 * chất lượng nguồn ngẫu nhiên.
 */
const MIN_DISTINCT_BYTES = 8;

/** Khối lặp dài tới ngần này thì vẫn bắt được (`abab…`, `0123 0123 …`). */
const MAX_CHECKED_PERIOD = 8;

/**
 * Trả về câu tả khuôn mẫu bắt được, hoặc `null` nếu bí mật trông như hàng thật.
 *
 * Câu tả đi thẳng vào thông báo lỗi của bên gọi: một phép từ chối mà không nói luật nào vừa nổ
 * thì người ta đi vòng qua nó chứ không sửa.
 */
export function describePlaceholderSecret(secret: Buffer): string | null {
  const distinct = new Set(secret).size;
  if (distinct < MIN_DISTINCT_BYTES) {
    return `chỉ có ${distinct} giá trị byte khác nhau trên ${secret.length} byte`;
  }

  for (let period = 1; period <= MAX_CHECKED_PERIOD; period += 1) {
    if (secret.length % period !== 0) continue;
    if (isRepeatingBlock(secret, period)) {
      return `lặp lại một khối ${period} byte`;
    }
  }

  if (isCounterRun(secret)) return "một dãy đếm tăng hoặc giảm đều";

  return null;
}

function isRepeatingBlock(secret: Buffer, period: number): boolean {
  for (let i = period; i < secret.length; i += 1) {
    if (secret[i] !== secret[i - period]) return false;
  }
  return true;
}

/** `00 01 02 …` và `ff fe fd …` — cuộn qua 0 vẫn tính là dãy đếm. */
function isCounterRun(secret: Buffer): boolean {
  if (secret.length < 2) return false;

  const step = (secret[1] - secret[0] + 256) % 256;
  if (step !== 1 && step !== 255) return false;

  for (let i = 2; i < secret.length; i += 1) {
    if ((secret[i] - secret[i - 1] + 256) % 256 !== step) return false;
  }
  return true;
}
