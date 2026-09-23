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
 * ## Constraint 3 -- browser transport results must remain truthful
 *
 * Browser fetch does not expose a portable reason that can distinguish a stopped Relay from CORS,
 * Local Network Access, a proxy, or another browser/network failure. A deadline therefore produces
 * `timeout`, and any other generic fetch failure (including `TypeError`) produces `indeterminate`.
 * Neither result establishes that permission was denied or that Relay is offline. `no-permission`
 * is reserved for a browser-specific signal that proves denial; the current transport path has no
 * such signal. Callers must offer an explicit manual check instead of guessing the cause.
 */
import {
  RELAY_PATHS,
  RELAY_COMPATIBILITY_UPDATE_TIMEOUT_MS,
  RELAY_DEVICE_RETIREMENT_MIN_VERSION,
  RELAY_LICENSE_CAPACITY_REFRESH_TIMEOUT_MS,
  RELAY_RETIREMENT_TIMEOUT_MS,
  RELAY_TIMEOUT_MS,
  RELAY_VERSION,
  type ConfigureRelayRequest,
  type CompatibilityUpdateReply,
  type CompatibilityUpdateRequest,
  type CompatibilityRollbackReply,
  type CompatibilityRollbackRequest,
  type DeviceRetirementReply,
  type DeviceRetirementRequest,
  type FinalizeDeviceRetirementRequest,
  type BootstrapAuthorizationRequest,
  type BootstrapCompletionReply,
  type OperatorKeyDeliveryReply,
  type OperatorKeyDeliveryRequest,
  type RelayHealth,
  type RelayLicenseCapacityRefreshReply,
  type RelayProfilesReply,
  type RelayReply,
  type SealOperatorKeyReply,
  type SealOperatorKeyRequest,
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
   * The Relay responded but rejected the request: invalid ticket, MKT Browser unavailable, obsolete version, and similar failures.
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
  /** Specific local evidence established that no compatible Relay endpoint is available. */
  | { status: "unreachable"; message: string }
  /** Browser fetch failed without a signal that can prove why the local Relay was unavailable. */
  | { status: "indeterminate"; message: string }
  /** The local request exceeded its own deadline; it does not establish the cause. */
  | { status: "timeout"; message: string }
  /** A browser-specific signal explicitly confirmed that local-network permission was denied. */
  | { status: "no-permission"; message: string };

const INDETERMINATE_MESSAGE =
  "MKTTool could not reach Relay from this page. Relay may be stopped, still starting, or blocked " +
  "by local browser access. Check Relay status, then try again.";

const TIMEOUT_MESSAGE =
  "Relay did not respond before the request deadline. It may still be starting or busy; check its " +
  "status, then try again.";

/**
 * Một lượt fetch xuống cầu nối, đã bọc đủ hạn giờ và phân loại cách hỏng.
 *
 * Không ném lỗi bao giờ: mọi đường hỏng đều thành một nhánh của `RelayOutcome`, vì chỗ gọi là
 * trình xử lý cú bấm và một promise reject ở đó chỉ làm nút chết lặng.
 */
async function callRelay<T extends RelayReply>(
  path: (typeof RELAY_PATHS)[keyof typeof RELAY_PATHS],
  init?: RequestInit,
  /**
   * Hạn giờ riêng cho lời gọi này. Mặc định `RELAY_TIMEOUT_MS`, và **hầu hết chỗ gọi phải giữ
   * mặc định** — xem `RELAY_CREATE_PROFILE_TIMEOUT_MS` về ngoại lệ duy nhất và vì sao nó tồn tại.
   */
  timeoutMs: number = RELAY_TIMEOUT_MS,
): Promise<RelayOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(relayUrl(path), {
      ...init,
      // Cầu nối không dùng cookie, và gửi kèm là mở thêm diện tích tấn công không đổi lại gì.
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return isRelayRequestTimeout(error)
      ? { status: "timeout", message: TIMEOUT_MESSAGE }
      : { status: "indeterminate", message: INDETERMINATE_MESSAGE };
  }

  let body: T;
  try {
    body = (await response.json()) as T;
  } catch (error) {
    if (isRelayRequestTimeout(error)) {
      return { status: "timeout", message: TIMEOUT_MESSAGE };
    }

    return {
      status: "rejected",
      message:
        `The response on Relay's port could not be read (HTTP ${response.status}). The program ` +
        `listening on that port is probably not Relay. Stop the conflicting program, start Relay, and try again.`,
    };
  }

  if (!response.ok || !body.ok) {
    return {
      status: "rejected",
      message:
        body.message ||
        `Relay rejected the request (HTTP ${response.status}). Check Relay's status page, then try again.`,
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

export function relaySupportsDeviceRetirement(relayVersion: number | undefined): boolean {
  return (
    Number.isSafeInteger(relayVersion) && relayVersion! >= RELAY_DEVICE_RETIREMENT_MIN_VERSION
  );
}

/**
 * Đánh thức đường xuống cầu nối và hỏi nó còn sống không.
 *
 * **Gọi ở dòng đầu trình xử lý cú bấm, không await** — xem ràng buộc 1 ở đầu file. Kết quả dùng
 * để giải thích vì sao lời gọi thật hỏng, nên cứ giữ promise lại rồi await sau.
 */
export function pingRelay(): Promise<RelayOutcome<RelayHealth & RelayReply>> {
  const outcome = callRelay<RelayHealth & RelayReply>(RELAY_PATHS.health);
  void reportRelayVersion(outcome);
  return outcome;
}

/**
 * Cái đã báo rồi trong phiên trang này, dạng `deviceId:version`.
 *
 * `pingRelay()` chạy ở dòng đầu của **mọi** trình xử lý cú bấm, nên không có cái chặn này thì mỗi
 * lần bấm là một lượt ghi database cho một con số hầu như không bao giờ đổi. Chỉ giữ trong bộ nhớ
 * và chỉ trong một lần tải trang: tải lại trang thì báo lại một lượt, và đó chính là thứ làm
 * `lastSeenAt` có nghĩa.
 */
const daBao = new Set<string>();

/**
 * Đẩy bản cầu nối vừa thấy về máy chủ. **Bắn rồi quên, nuốt mọi lỗi.**
 *
 * Đây là quan trắc chứ không phải điều khiển (xem `relay-device-version-reporting.ts`): thứ quyết
 * định một cầu nối cũ làm được gì là `minRelayVersion` trong từng tấm vé, do chính cầu nối đối
 * chiếu. Nên đường này không được phép làm hỏng thao tác người dùng đang thực sự làm — nó nằm trên
 * đường bấm nút, và một lượt ghi hỏng ở đây mà nổi lên thành lỗi thì đắt hơn nhiều lần cái nó mua.
 */
async function reportRelayVersion(
  outcome: Promise<RelayOutcome<RelayHealth & RelayReply>>,
): Promise<void> {
  try {
    const ket_qua = await outcome;
    // Cả nhánh `ok` lẫn nhánh `rejected` đều mang `relayVersion` — và nhánh bị từ chối mới là
    // nhánh đáng quan tâm, vì một cầu nối dưới sàn bị từ chối chính là chiếc cần nhìn thấy nhất.
    if (ket_qua.status !== "ok" && ket_qua.status !== "rejected") return;
    const relayVersion = ket_qua.relayVersion;
    const deviceId = ket_qua.data?.deviceId;
    if (!deviceId || typeof relayVersion !== "number") return;

    const khoa = `${deviceId}:${relayVersion}`;
    if (daBao.has(khoa)) return;
    daBao.add(khoa);

    const { recordRelayDeviceVersion } = await import("@/lib/tickets/relay-device-version-reporting");
    await recordRelayDeviceVersion({ deviceId, relayVersion });
  } catch {
    // Có chủ đích: không log, không hiện gì. Xem chú thích trên.
  }
}

/** Đưa một tấm vé mở profile xuống cầu nối. */
/**
 * Danh sách profile trên máy này, kèm danh mục để dựng cái mới.
 *
 * Cầu nối bản cũ không có đường này nên sẽ trả 404 → `rejected`. Chỗ gọi phải coi đó là **bình
 * thường** và lùi về ô gõ tay, không phải một lỗi để kêu lên: người dùng chưa cài lại `.exe` thì
 * cũng chưa mất gì, chỉ là chưa có tiện nghi mới.
 */
export function fetchRelayProfiles(): Promise<RelayOutcome<RelayProfilesReply>> {
  return callRelay<RelayProfilesReply>(RELAY_PATHS.profiles);
}

/** Explicit operator action: refresh Browser capacity without launching or queueing a profile. */
export function refreshRelayLicenseCapacity(): Promise<
  RelayOutcome<RelayLicenseCapacityRefreshReply>
> {
  return callRelay<RelayLicenseCapacityRefreshReply>(
    RELAY_PATHS.licenseCapacityRefresh,
    { method: "POST" },
    RELAY_LICENSE_CAPACITY_REFRESH_TIMEOUT_MS,
  );
}

/**
 * Đưa một tấm vé thao tác profile xuống cầu nối.
 *
 * `timeoutMs` chỉ khai khi loại vé đó **vốn chạy lâu** — hôm nay là đúng vé tạo profile. Vé mở
 * profile và vé bí mật giữ mặc định: chúng xong trong vài chục mili giây, và một hạn giờ dài ở đó
 * chỉ làm người dùng ngồi nhìn nút xám lâu hơn trước khi đọc được câu lỗi.
 */
export function sendTicketToRelay(
  ticket: string,
  timeoutMs?: number,
): Promise<RelayOutcome<RelayReply>> {
  return callRelay<RelayReply>(
    RELAY_PATHS.ticket,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    },
    timeoutMs,
  );
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
  delivery: OperatorKeyDeliveryRequest,
): Promise<RelayOutcome<OperatorKeyDeliveryReply>> {
  return callRelay<OperatorKeyDeliveryReply>(RELAY_PATHS.receiveOperatorKey, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(delivery),
  });
}

export function authorizeBootstrap(authorization: string): Promise<RelayOutcome<RelayReply>> {
  return callRelay<RelayReply>(RELAY_PATHS.authorizeBootstrap, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authorization } satisfies BootstrapAuthorizationRequest),
  });
}

export function readBootstrapCompletion(): Promise<RelayOutcome<BootstrapCompletionReply>> {
  return callRelay<BootstrapCompletionReply>(RELAY_PATHS.bootstrapCompletion);
}

export function retireRelayDevice(
  authorization: string,
): Promise<RelayOutcome<DeviceRetirementReply>> {
  return callRelay<DeviceRetirementReply>(RELAY_PATHS.retireDevice, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authorization } satisfies DeviceRetirementRequest),
  }, RELAY_RETIREMENT_TIMEOUT_MS);
}

export function finalizeRelayDeviceRetirement(
  authorization: string,
): Promise<RelayOutcome<RelayReply>> {
  return callRelay<RelayReply>(RELAY_PATHS.finalizeDeviceRetirement, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authorization } satisfies FinalizeDeviceRetirementRequest),
  });
}

export function rollbackRelayCompatibility(
  authorization: CompatibilityRollbackRequest["authorization"],
): Promise<RelayOutcome<CompatibilityRollbackReply>> {
  return callRelay<CompatibilityRollbackReply>(RELAY_PATHS.compatibilityRollback, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authorization } satisfies CompatibilityRollbackRequest),
  });
}

export function updateRelayCompatibility(
  ticket: CompatibilityUpdateRequest["ticket"],
): Promise<RelayOutcome<CompatibilityUpdateReply>> {
  return callRelay<CompatibilityUpdateReply>(
    RELAY_PATHS.compatibilityUpdate,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket } satisfies CompatibilityUpdateRequest),
    },
    RELAY_COMPATIBILITY_UPDATE_TIMEOUT_MS,
  );
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

/**
 * Câu giải thích cho những lời gọi **vốn chạy lâu** — tạo profile, mở profile.
 *
 * ## Vì sao không dùng chung `describeRelayFailure`
 *
 * Câu chung của nó khẳng định *"trình duyệt không cho trang này gọi xuống máy"*, suy ra từ giả
 * định **lời gọi vốn nhanh, treo tức là bị chặn**. Giả định đó là nền của cả ràng buộc 3 ở đầu
 * file, và nó đúng — cho ping, cho lượt bọc bí mật, cho lượt liệt kê profile.
 *
 * For the two operations that ask MKT Browser to create or launch a real browser, that assumption
 * is **wrong**, and in the worst way: it sends operators to re-enable a permission that is not
 * broken even though the operation they requested has already completed. Both cases occurred on a
 * real machine on 2026-08-07.
 *
 * Describe both possibilities instead of asserting one, and tell the operator where to check:
 * whether a window just opened or a profile just appeared in MKT Browser.
 */
export function describeSlowRelayFailure(
  attempt: RelayOutcome<unknown>,
  /** Việc cầu nối đang làm, viết tiếp được sau chữ "đang": `"dựng profile"`, `"mở profile"`. */
  viec: string,
): string {
  if (attempt.status === "ok") return "";
  if (attempt.status === "rejected") return attempt.message;

  if (attempt.status === "timeout") {
    return (
      `Relay did not respond within the request deadline. It may still be ${viec}. Check whether ` +
      `the operation completed before trying again.`
    );
  }
  return attempt.message;
}

function isRelayRequestTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}
