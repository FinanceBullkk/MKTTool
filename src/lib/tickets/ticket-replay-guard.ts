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
 * ## Vì sao giờ có ghi đĩa, sau khi đã từng lập luận ngược lại
 *
 * Bản đầu cố ý giữ sổ **chỉ trong bộ nhớ**, với hai lý do: cửa sổ tấn công còn lại quá hẹp
 * (khởi động lại cầu nối trong vòng 30 giây kể từ khi vé được phát, và có sẵn bản sao vé), và
 * ghi đĩa thì phải trả giá bằng một `fsync` trên đường nóng của mọi cú bấm, cộng thêm một thứ
 * nữa để hỏng.
 *
 * Đo lại ngày 26/08/2026 thì cả hai vế của cái giá đó đều không đứng:
 *
 * - **Đường nóng không nóng.** `consume` nằm trên đường một cú bấm tay, chỗ đã có sẵn kiểm chữ
 *   ký Ed25519, mở phong bì X25519 và spawn một trình duyệt. Vài mili-giây ghi file ở đó không
 *   ai đo được.
 * - **Không phải thứ mới để hỏng.** Cầu nối đã ghi file nguyên tử ở bốn chỗ khác bằng đúng một
 *   khuôn `tmp` + `rename`. Sổ này dùng lại khuôn ấy, không dựng khuôn mới.
 *
 * Còn vế "cửa sổ hẹp" thì vẫn đúng, nhưng nó không phải lý do để bỏ trống: khởi động lại **không
 * nhất thiết do kẻ tấn công gây ra** — crash, cập nhật, reboot đều tự xảy ra. Gate `G3-RECOVERY`
 * bắt được đúng tình huống đó và gọi tên nó là `RELAY-RESTART-FORGETS-SPENT-TICKET`.
 *
 * Lớp này vẫn **không biết gì về đĩa**. Nó nhận một hàm ghi tiêm từ ngoài, nên phần thuần logic
 * còn test được mà không cần thư mục tạm, và phía cầu nối là nơi duy nhất chạm `node:fs`.
 *
 * ## Dọn theo lối lười
 *
 * Không hẹn giờ nền. Mỗi lần ghi mới thì quét bỏ phần đã hết hạn. Số jti sống cùng lúc bị chặn
 * bởi *"số vé phát trong 30 giây"* — với 5-6 người bấm tay thì đó là vài chục mục. Một `setInterval`
 * ở đây là thêm một tiến trình nền phải nhớ dọn khi tắt, đổi lấy thứ không đo được.
 */

/** Một jti đã tiêu, cùng mốc hết hạn của chính tấm vé mang nó. */
export interface SpentTicketRecord {
  jti: string;
  expiresAt: number;
}

/** Sổ jti đã tiêu, cùng mốc hết hạn của từng cái. */
export class TicketReplayGuard {
  private readonly spent = new Map<string, number>();

  /**
   * `persist` là tùy chọn có chủ ý. Không truyền thì sổ chỉ sống trong bộ nhớ — đúng hành vi cũ,
   * và là thứ mọi test dựng danh tính trực tiếp vẫn cần.
   */
  constructor(private readonly persist?: (records: SpentTicketRecord[]) => void) {}

  /**
   * Nạp lại sổ của lần chạy trước.
   *
   * Vé đã hết hạn bị bỏ ngay tại đây chứ không nạp vào rồi dọn sau: `verifyTicket` từ chối chúng
   * vì quá hạn trước khi hỏi tới sổ, nên nhớ chúng không đổi được kết quả nào, chỉ làm sổ phình.
   */
  restore(records: readonly SpentTicketRecord[], now: number = Date.now()): void {
    for (const record of records) {
      if (record.expiresAt > now) this.spent.set(record.jti, record.expiresAt);
    }
  }

  /**
   * Đánh dấu một vé là đã tiêu.
   *
   * Trả `true` nếu đây là lần đầu, `false` nếu vé này đã tiêu rồi. Gộp hai việc "hỏi" và "ghi"
   * vào một lời gọi là cố ý: tách ra thành `isSpent()` rồi `markSpent()` là dựng lại đúng khe
   * mà cả lớp này sinh ra để bịt.
   *
   * `expiresAt` lấy từ chính tấm vé — nhưng chỉ dùng để biết khi nào quên được nó, không dùng
   * để quyết định vé còn hạn hay không. Việc đó là của `verifyTicket`.
   *
   * Chỉ ghi đĩa khi sổ thật sự đổi. Lần tiêu lại của một vé cũ không đổi gì, nên không ghi.
   */
  consume(jti: string, expiresAt: number, now: number = Date.now()): boolean {
    this.forget(now);

    if (this.spent.has(jti)) return false;

    this.spent.set(jti, expiresAt);
    this.persist?.(this.records());
    return true;
  }

  /** Bỏ khỏi sổ những vé đã hết hạn — chúng bị từ chối vì quá hạn rồi, không cần nhớ nữa. */
  private forget(now: number): void {
    for (const [jti, expiresAt] of this.spent) {
      if (expiresAt <= now) this.spent.delete(jti);
    }
  }

  /** Ảnh chụp sổ để đem đi ghi. */
  private records(): SpentTicketRecord[] {
    return [...this.spent].map(([jti, expiresAt]) => ({ jti, expiresAt }));
  }

  /** Số jti đang giữ. Dùng trong test và trang trạng thái của cầu nối. */
  get size(): number {
    return this.spent.size;
  }
}
