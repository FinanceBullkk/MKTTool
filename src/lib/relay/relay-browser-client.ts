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
  type RelayHealth,
  type RelayReply,
  relayUrl,
} from "./relay-endpoints";

/** Kết quả một lời gọi xuống cầu nối. Bốn nhánh, và mỗi nhánh dẫn tới một hành động khác. */
export type RelayOutcome<T> =
  /** Cầu nối trả lời và nói việc đã xong. */
  | { status: "ok"; data: T }
  /** Cầu nối trả lời nhưng từ chối — vé hỏng, MultiZen không mở được, bản quá cũ… */
  | { status: "rejected"; message: string }
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
    return { status: "rejected", message: body.message || `Cầu nối từ chối (HTTP ${response.status}).` };
  }

  return { status: "ok", data: body };
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
