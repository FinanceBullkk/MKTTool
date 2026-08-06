/**
 * Gọi cầu nối từ **trình duyệt**. Nơi ba ràng buộc đo được ở spike GĐ0 được cài thành code.
 *
 * ## Ràng buộc 1 — lời gọi đầu tiên trên mỗi máy phải nằm trong trình xử lý cú bấm
 *
 * Luật Local Network Access hỏi **người dùng**, không hỏi máy chủ: header CORS khéo tới đâu cũng
 * không tự mở được đường. Hộp xin quyền chỉ hiện ra khi lời gọi mang **kích hoạt người dùng**,
 * và kích hoạt đó **mất sau vòng `await` đầu tiên**.
 *
 * Đó là lý do có `pingRelay()`. Mọi nút ở đây đều phải xin vé từ máy chủ trước, mà xin vé là một
 * vòng `await` — bắn lời gọi thật sau đó thì trên chiếc máy chưa cấp quyền, Chrome nuốt luôn cả
 * hộp xin quyền lẫn request. Cách sửa là **khởi động `pingRelay()` ngay dòng đầu của trình xử lý
 * cú bấm và KHÔNG await nó**: request rời đi lúc kích hoạt còn nguyên, hộp xin quyền hiện ra, và
 * lời gọi thật sau đó chạy trên quyền vừa được cấp.
 *
 * ```ts
 * async function onClick() {
 *   const ping = pingRelay();          // ← dòng đầu, không await
 *   const ticket = await xinVe();      // ← kích hoạt người dùng mất ở đây
 *   const sent = await sendTicket(ticket);
 *   if (sent.status !== "ok") hienLoi(describeRelayFailure(await ping));
 * }
 * ```
 *
 * ## Ràng buộc 2 — mọi lời gọi tự đặt hạn giờ
 *
 * Bị chặn thì fetch **treo im, không ném lỗi**. `AbortSignal.timeout` là thứ biến cảnh đó thành
 * một trạng thái đọc được. Xem `RELAY_TIMEOUT_MS`.
 *
 * ## Ràng buộc 3 — "chưa cấp quyền" là trạng thái RIÊNG, không gộp vào "mất kết nối"
 *
 * Hai tình huống, hai việc phải làm khác hẳn nhau — một cái là bấm "Cho phép", cái kia là bật
 * lại cầu nối. Phân biệt được nhờ **cách hỏng khác nhau**, đo ở spike:
 *
 * | Cách hỏng | Nghĩa là |
 * |---|---|
 * | Hết hạn giờ (`AbortError`) | Luật mạng nội bộ nuốt request — **chưa cấp quyền** |
 * | `TypeError` ngay lập tức | Không có ai nghe ở cổng đó — **cầu nối chưa chạy** |
 *
 * Suy luận này là **phỏng đoán có cơ sở, không phải điều trình duyệt tự khai** — không có API
 * nào nói thẳng "bị policy chặn". Nên câu chữ ở `describeRelayFailure` nêu cả hai khả năng theo
 * thứ tự khả dĩ, chứ không khẳng định chắc nịch một cái.
 */
import {
  RELAY_PATHS,
  RELAY_TIMEOUT_MS,
  RELAY_VERSION,
  type ConfigureRelayRequest,
  type RelayHealth,
  type RelayReply,
  type SealOperatorKeyReply,
  type SealOperatorKeyRequest,
  type SealedOperatorKeyGrant,
  relayUrl,
} from "./relay-endpoints";

/**
 * Kết quả một lời gọi xuống cầu nối. Bốn nhánh, và mỗi nhánh dẫn tới một hành động khác.
 *
 * Hai nhánh đầu mang thêm `relayVersion` — **kể cả nhánh bị từ chối**, và đó mới là nhánh quan
 * trọng: một chiếc máy chạy bản quá cũ bị từ chối vé (`RELAY_TOO_OLD`) chính là chiếc máy cần
 * thấy dải *"tải bản mới"* nhất. Bỏ số phiên bản đi ở nhánh đó là chỉ nhắc được những người
 * chưa cần nhắc.
 */
export type RelayOutcome<T> =
  /** Cầu nối trả lời và nói việc đã xong. */
  | { status: "ok"; data: T; relayVersion?: number }
  /**
   * Cầu nối trả lời nhưng từ chối — vé hỏng, MultiZen không mở được, bản quá cũ…
   *
   * Mang theo cả `data`, và đó không phải tiện tay giữ lại: `/health` của một chiếc máy **chưa
   * cấu hình xong** trả về `ok: false` — tức đi ra bằng đúng nhánh này — nhưng thân của nó vẫn
   * có `publicKey`, thứ duy nhất để đăng ký chính chiếc máy đó. Vứt thân đi ở đây là khóa luồng
   * cài đặt ở đúng chiếc máy nó sinh ra để phục vụ, mà lại khóa theo kiểu không ai đoán ra: cầu
   * nối trả lời đầy đủ, web app thì bảo "chưa đọc được khóa công khai".
   *
   * `undefined` khi phản hồi không đọc nổi thành JSON — lúc đó không có thân nào để giữ.
   */
  | { status: "rejected"; message: string; data?: T; relayVersion?: number }
  /** Không ai nghe ở `127.0.0.1` — gần như chắc chắn cầu nối chưa chạy. */
  | { status: "unreachable"; message: string }
  /** Request treo tới hết hạn giờ — gần như chắc chắn chưa cấp quyền mạng nội bộ. */
  | { status: "no-permission"; message: string };

const UNREACHABLE_MESSAGE =
  "Không thấy cầu nối trên máy này. Mở ứng dụng cầu nối rồi bấm lại — nó phải đang chạy thì " +
  "trình duyệt mới đưa vé xuống được.";

const NO_PERMISSION_MESSAGE =
  "Trình duyệt không cho trang này gọi xuống máy của bạn. Bấm lại và chọn \"Cho phép\" ở hộp " +
  "hỏi quyền; nếu không thấy hộp nào thì mở biểu tượng ổ khóa trên thanh địa chỉ và bật lại " +
  "quyền truy cập mạng nội bộ. (Cũng có thể cầu nối đang chạy nhưng bị treo — thử tắt bật lại.)";

/**
 * Một lượt fetch xuống cầu nối, đã bọc đủ hạn giờ và phân loại cách hỏng.
 *
 * Không ném lỗi bao giờ: mọi đường hỏng đều thành một nhánh của `RelayOutcome`, vì chỗ gọi là
 * trình xử lý cú bấm và một promise reject ở đó chỉ làm nút chết lặng.
 */
async function callRelay<T extends RelayReply>(
  path: (typeof RELAY_PATHS)[keyof typeof RELAY_PATHS],
  init?: RequestInit,
): Promise<RelayOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(relayUrl(path), {
      ...init,
      // Cầu nối không dùng cookie, và gửi kèm là mở thêm diện tích tấn công không đổi lại gì.
      credentials: "omit",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "TimeoutError";
    return aborted
      ? { status: "no-permission", message: NO_PERMISSION_MESSAGE }
      : { status: "unreachable", message: UNREACHABLE_MESSAGE };
  }

  let body: T;
  try {
    body = (await response.json()) as T;
  } catch {
    return {
      status: "rejected",
      message:
        `Cầu nối trả lời nhưng không đọc được (HTTP ${response.status}). Nhiều khả năng thứ ` +
        `đang nghe ở cổng đó không phải cầu nối.`,
    };
  }

  if (!response.ok || !body.ok) {
    return {
      status: "rejected",
      message: body.message || `Cầu nối từ chối (HTTP ${response.status}).`,
      // Giữ nguyên thân: một lời từ chối vẫn khai đủ thứ chỗ gọi cần — xem chú thích ở nhánh
      // `rejected` của `RelayOutcome`.
      data: body,
      relayVersion: body.relayVersion,
    };
  }

  return { status: "ok", data: body, relayVersion: body.relayVersion };
}

/**
 * Số bản cầu nối đang chạy — **chỉ khi nó cũ hơn** bản máy chủ đang phát hành. `null` là mọi
 * trường hợp còn lại.
 *
 * Trả thẳng con số thay vì `true`/`false` vì chỗ gọi cần chính con số đó để hiện ra, và vì
 * `relayVersion` chỉ tồn tại ở hai nhánh của `RelayOutcome`: gộp cả phép thu hẹp kiểu lẫn phép
 * so vào một chỗ thì chỗ gọi không phải tự nhớ nhánh nào có trường nào.
 *
 * `null` bao gồm cả nghĩa **chưa biết** — cầu nối không trả lời được thì không có số nào để so,
 * và đoán bừa ở đó là hiện dải "bản cũ" cho một chiếc máy chỉ đang tắt. Trạng thái đó đã có câu
 * riêng.
 *
 * Không có bộ tự cập nhật (QĐ 11): một chương trình giữ khóa của cả kho mà tự tải mã mới về chạy
 * là đúng thứ mọi lớp bảo vệ ở đây dựng ra để chặn. Đổi lại, dải này là **đường duy nhất** báo
 * cho người ta biết cần cập nhật trước khi một tấm vé hỏng.
 */
export function outdatedRelayVersion(outcome: RelayOutcome<unknown>): number | null {
  if (outcome.status !== "ok" && outcome.status !== "rejected") return null;
  if (outcome.relayVersion === undefined) return null;

  return outcome.relayVersion < RELAY_VERSION ? outcome.relayVersion : null;
}

/**
 * Đánh thức đường xuống cầu nối và hỏi nó còn sống không.
 *
 * **Gọi ở dòng đầu trình xử lý cú bấm, không await** — xem ràng buộc 1 ở đầu file. Kết quả dùng
 * để giải thích vì sao lời gọi thật hỏng, nên cứ giữ promise lại rồi await sau.
 */
export function pingRelay(): Promise<RelayOutcome<RelayHealth & RelayReply>> {
  return callRelay<RelayHealth & RelayReply>(RELAY_PATHS.health);
}

/** Đưa một tấm vé mở profile xuống cầu nối. */
export function sendTicketToRelay(ticket: string): Promise<RelayOutcome<RelayReply>> {
  return callRelay<RelayReply>(RELAY_PATHS.ticket, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
}

/**
 * Ghi hộ cấu hình xuống cầu nối trên máy đang ngồi.
 *
 * Thay cho việc người cài chép tay hai giá trị mà chỉ máy chủ mới biết. Đường này chỉ đi được vì
 * cầu nối **nung sẵn nguồn web vào bản build** — chưa cấu hình mà vẫn cấp header CORS cho đúng
 * một nguồn. Xem `BUILT_IN_WEB_ORIGIN`.
 */
export function configureRelay(
  enrollment: ConfigureRelayRequest,
): Promise<RelayOutcome<RelayReply>> {
  return callRelay<RelayReply>(RELAY_PATHS.configure, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(enrollment),
  });
}

/** Nhờ cầu nối mã hóa bí mật nick bằng khóa vùng operator của máy đó. */
export function encryptForVault<T extends RelayReply>(
  secrets: Record<string, string>,
): Promise<RelayOutcome<T>> {
  return callRelay<T>(RELAY_PATHS.encryptForVault, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(secrets),
  });
}

/**
 * Nhờ cầu nối **của người đang bấm** bọc khóa vùng operator cho một máy khác.
 *
 * Chỉ ADMIN có nút gọi hàm này, nhưng cầu nối không kiểm điều đó và không cần: thứ nó trả về là
 * một cái hộp chỉ máy nhận mở được, vô dụng với chính người vừa gọi. Xem `handle-seal-operator-key.ts`.
 */
export function sealOperatorKey(
  recipientPublicKey: string,
): Promise<RelayOutcome<SealOperatorKeyReply>> {
  return callRelay<SealOperatorKeyReply>(RELAY_PATHS.sealOperatorKey, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientPublicKey } satisfies SealOperatorKeyRequest),
  });
}

/** Đưa hộp khóa xuống cầu nối trên máy đang ngồi để nó tự mở bằng khóa riêng của nó. */
export function receiveOperatorKey(
  grant: SealedOperatorKeyGrant,
): Promise<RelayOutcome<RelayReply>> {
  return callRelay<RelayReply>(RELAY_PATHS.receiveOperatorKey, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(grant),
  });
}

/**
 * Câu giải thích cho người dùng khi một lời gọi hỏng.
 *
 * Nhận cả kết quả lời gọi thật lẫn kết quả `pingRelay`, và **ưu tiên lời gọi thật** — nó là thứ
 * người dùng vừa bấm. Ping chỉ đỡ cho đúng một ca: lời gọi thật hỏng vì hết hạn giờ, mà ping
 * (bắn sớm hơn, lúc còn kích hoạt) đã kịp biết là chưa cấp quyền.
 */
export function describeRelayFailure(
  attempt: RelayOutcome<unknown>,
  ping?: RelayOutcome<unknown>,
): string {
  if (attempt.status === "ok") return "";
  if (attempt.status === "rejected") return attempt.message;

  // Ping biết rõ hơn thì nghe ping: nó là lời gọi mang kích hoạt người dùng, nên nó mới là lời
  // gọi làm hộp xin quyền hiện ra hay không.
  if (ping && ping.status !== "ok" && ping.status !== "rejected") return ping.message;
  return attempt.message;
}
