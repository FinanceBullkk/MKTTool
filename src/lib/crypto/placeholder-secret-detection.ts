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
 * ## Gọi chốt này Ở ĐÂU — luật quan trọng hơn bản thân ba luật trên
 *
 * **Kiểm một bí mật lúc nó được NHẬN VÀO, không bao giờ lúc nó được DÙNG.**
 *
 * Nhận vào là chỗ một con người vừa chọn một giá trị, và từ chối ở đó chỉ tốn một lần dán lại.
 * Dùng là chỗ từ chối lấy đi cái máy đang chạy được hoặc dữ liệu của người ta. Cùng một phép
 * kiểm, đặt ở hai chỗ, cho ra hai mức thiệt hại khác hẳn nhau.
 *
 * Vì thế: `parseVaultKey` chốt ở đường env vào tiến trình, còn `allowPlaceholder` mở cho đúng
 * đường đọc khóa cũ để xoay. Cầu nối chốt ở ô dán tay, nhưng **không** chốt ở đường nhận khóa
 * đã bọc từ máy khác, và **không** chốt lúc nạp khóa đã lưu — chốt ở đó sẽ biến một máy đang
 * làm việc thành máy chưa cấu hình (`main.ts:102`), tức là mất trắng vì một khóa yếu nhưng vẫn
 * chạy. Và lúc khởi động máy chủ cũng không kiểm: khởi động là dùng, không phải nhận vào.
 *
 * ## Chỗ luật này CỐ Ý không với tới
 *
 * Không đo entropy, nên một khóa "trông ngẫu nhiên" mà thật ra lấy từ nguồn kém — `Math.random()`
 * chẳng hạn — vẫn lọt. Đó là đánh đổi có chủ ý, không phải sót: bắt được nó đòi hỏi một phép đo
 * thống kê, mà phép đo ấy chính là thứ có thể chặn nhầm khóa thật.
 *
 * `.env.example` để trống chứ không cài sẵn giá trị mồi, nên chốt này là lưới thứ hai chứ không
 * phải lưới duy nhất.
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

/**
 * Chu kỳ lặp lớn nhất còn xét: **một nửa** độ dài bí mật.
 *
 * Không phải hằng số tùy chọn mà là giới hạn tự nhiên — khối dài hơn nửa thì không lặp nổi lần
 * nào trong 32 byte, nên `length / 2` chính là dạng đầy đủ của luật: "bí mật này có phải một khối
 * ngắn hơn lặp lại không". Con số 8 hồi C2 là tùy tiện, và nó để lọt đúng khuôn hay gặp nhất —
 * `00112233445566778899aabbccddeeff` viết hai lần, thứ chính repo này dùng làm fixture ở
 * `ci.yml` và mười file test. Một chốt sinh ra để bắt thứ người gõ tay mà để lọt khuôn người gõ
 * tay nhiều nhất thì mới là thứ cần sửa.
 *
 * Không có rủi ro chặn nhầm: xác suất một khóa ngẫu nhiên thật có hai nửa 16 byte giống hệt nhau
 * là 2^-128.
 */
function maxCheckedPeriod(length: number): number {
  return Math.floor(length / 2);
}

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

  for (let period = 1; period <= maxCheckedPeriod(secret.length); period += 1) {
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
