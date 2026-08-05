/**
 * Chống dùng lại vé: mỗi `jti` tiêu được đúng một lần.
 *
 * ## Vì sao ở cầu nối chứ không ở máy chủ
 *
 * Không phải lựa chọn — là hệ quả của QĐ 5. Cầu nối **không nối mạng ra ngoài**, nên nó không
 * hỏi máy chủ được *"vé này tiêu chưa"*. Máy chủ cũng không trả lời được: nó phát vé rồi thôi,
 * vé đi qua tay trình duyệt và máy chủ không bao giờ thấy lại. Bên duy nhất chứng kiến việc
 * tiêu vé là bên tiêu nó.
 *
 * ## Vì sao trong bộ nhớ, không phải trên đĩa
 *
 * Vé sống 30 giây. Cầu nối khởi động lại thì danh sách mất — nhưng mọi vé phát trước lúc đó
 * cũng đã hết hạn, hoặc sắp. Cửa sổ tấn công còn lại là *"khởi động lại cầu nối trong vòng 30
 * giây kể từ khi một tấm vé được phát, và có sẵn bản sao tấm vé đó"*. Kẻ làm được điều đó đã
 * đứng trên máy nạn nhân với quyền chạy chương trình rồi — lúc ấy khóa vùng operator nằm ngay
 * đó, đi vòng qua vé làm gì.
 *
 * Ghi ra đĩa thì đổi lại: một file phải fsync trên đường nóng của mọi cú bấm, và một thứ nữa
 * để hỏng. Không đáng.
 *
 * ## Dọn theo lối lười
 *
 * Không hẹn giờ nền. Mỗi lần ghi mới thì quét bỏ phần đã hết hạn. Số jti sống cùng lúc bị chặn
 * bởi *"số vé phát trong 30 giây"* — với 5-6 người bấm tay thì đó là vài chục mục. Một `setInterval`
 * ở đây là thêm một tiến trình nền phải nhớ dọn khi tắt, đổi lấy thứ không đo được.
 */

/** Sổ jti đã tiêu, cùng mốc hết hạn của từng cái. */
export class TicketReplayGuard {
  private readonly spent = new Map<string, number>();

  /**
   * Đánh dấu một vé là đã tiêu.
   *
   * Trả `true` nếu đây là lần đầu, `false` nếu vé này đã tiêu rồi. Gộp hai việc "hỏi" và "ghi"
   * vào một lời gọi là cố ý: tách ra thành `isSpent()` rồi `markSpent()` là dựng lại đúng khe
   * mà cả lớp này sinh ra để bịt.
   *
   * `expiresAt` lấy từ chính tấm vé — nhưng chỉ dùng để biết khi nào quên được nó, không dùng
   * để quyết định vé còn hạn hay không. Việc đó là của `verifyTicket`.
   */
  consume(jti: string, expiresAt: number, now: number = Date.now()): boolean {
    this.forget(now);

    if (this.spent.has(jti)) return false;

    this.spent.set(jti, expiresAt);
    return true;
  }

  /** Bỏ khỏi sổ những vé đã hết hạn — chúng bị từ chối vì quá hạn rồi, không cần nhớ nữa. */
  private forget(now: number): void {
    for (const [jti, expiresAt] of this.spent) {
      if (expiresAt <= now) this.spent.delete(jti);
    }
  }

  /** Số jti đang giữ. Dùng trong test và trang trạng thái của cầu nối. */
  get size(): number {
    return this.spent.size;
  }
}
