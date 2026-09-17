import type { RelayOutcome } from "./relay-browser-client";

/** Lượt cầu nối TRẢ LỜI nhưng từ chối — nhánh duy nhất mang theo mã và chặng. */
export type RelayRejection = Extract<RelayOutcome<unknown>, { status: "rejected" }>;

/**
 * Mã hỏng ổn định mà cầu nối gửi kèm một lượt từ chối.
 *
 * ## Vì sao phải nhặt ở hai chỗ
 *
 * Hai luồng đặt mã ở hai nơi khác nhau, và cả hai đều đang chạy thật: mở profile
 * (`relay/src/launch-profile.ts`) trải `code` thẳng vào thân phản hồi, còn tạo profile
 * (`relay/src/create-profile.ts`) gói nó trong `diagnostic`. Chỗ gọi không nên phải biết mình
 * đang đọc luồng nào.
 *
 * ## Vì sao KHÔNG đọc câu chữ
 *
 * Câu của cầu nối ghép bằng `${describe(error)}`, tức nguyên văn lỗi engine — nó đổi lúc nào cũng
 * được và mang theo thứ không nên hiện ra trang web. Mã thì là giao kèo; xem
 * `MKT_BROWSER_ERROR_CODES` trong `mkt-browser-contract.ts`.
 */
export function relayFailureCode(outcome: RelayRejection): string | null {
  const data = outcome.data;
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (typeof body?.code === "string") return body.code;

  const diagnostic =
    body?.diagnostic && typeof body.diagnostic === "object"
      ? (body.diagnostic as Record<string, unknown>)
      : null;
  return typeof diagnostic?.code === "string" ? diagnostic.code : null;
}

/**
 * Chặng mà lượt từ chối dừng lại: `"browser-health"`, `"create-profile"`, `"complete"`...
 *
 * Nó phân biệt được hai câu mà nếu chỉ nhìn `code` thì giống hệt nhau, vì **cả hai đều không có
 * mã**: một câu do chính cầu nối viết cho người đọc (`"browser-health"` — lời của
 * `currentDeviceBrowserReadiness()`, đáng hiện nguyên văn), và một câu ghép từ lỗi thô của engine
 * (`"create-profile"` — không đáng hiện). Xem `relay/src/create-profile.ts`.
 */
export function relayFailureStage(outcome: RelayRejection): string | null {
  const data = outcome.data;
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const diagnostic =
    body?.diagnostic && typeof body.diagnostic === "object"
      ? (body.diagnostic as Record<string, unknown>)
      : null;
  return typeof diagnostic?.stage === "string" ? diagnostic.stage : null;
}
