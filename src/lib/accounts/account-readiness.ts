/**
 * **Nick này đã dùng được chưa, và nếu chưa thì thiếu gì.**
 *
 * ## Vì sao cần một hàm riêng cho câu hỏi này
 *
 * Điều kiện dùng được một nick nằm rải ở tám cột thuộc bốn bảng. Trước khi có file này, người
 * dùng phải tự ghép chúng từ bảng "Thông tin" 15 dòng ở trang chi tiết — và trang danh sách thì
 * không nói gì cả. Kết quả là *"bấm nút mới biết"*, đúng kiểu hỏng mà cả dự án tránh ở chỗ khác
 * (proxy "chưa kiểm lần nào" không hiện như đang khỏe; bộ dò "không dò được" không báo là "khỏe").
 *
 * Một hàm thuần, ba chỗ đọc: cột **Sẵn sàng** ở `/accounts`, dải trạng thái ở trang chi tiết nick,
 * và dải cảnh báo ở trang Hôm nay. Ba chỗ mà tự ghép riêng thì sớm muộn ba chỗ nói ba kiểu.
 *
 * ## Điều kiện KHÁC NHAU theo nền tảng, và đó là điểm chính
 *
 * Nick Reddit cần một proxy, một profile cấu hình và một máy được gán. Fanpage đăng bằng Graph API có
 * token chính thức — không mở trình duyệt, không proxy, không profile, nên **không có máy nào để
 * ghim**. Đòi đủ tám điều kiện cho nick Facebook là bịa ra bốn lỗi vĩnh viễn không sửa được, và
 * người đọc sẽ học cách phớt lờ cả cột.
 *
 * Ranh giới này đã có sẵn ở `validatePlatformAccountFields()` và ở `launch/route.ts`; file này
 * đọc cùng một ranh giới chứ không dựng ranh giới mới.
 *
 * Từ 07/08/2026, file này còn gánh thêm một điều kiện mà **chỉ** nó chấm được: `NOT_LOGGED_IN`.
 * Hai lớp gác kia không nhìn thấy nó — form thì chấm lúc nhập, còn `launch/route.ts` thì phải
 * cho mở profile chính vì người ta đang định vào đó đăng nhập lần đầu.
 */
import { platformFamily } from "@/lib/platforms/platform-family";
import { PROBLEM_VERDICTS } from "@/lib/proxies/proxy-liveness-verdict";
import { coldStartDaysRemaining, getStatusPresentation } from "./account-status";

/** Mã lý do — dùng làm `key` lúc vẽ danh sách và làm mỏ neo trong test. Đừng đổi khi sửa câu chữ. */
export type ReadinessBlockerCode =
  | "STATUS"
  | "COLD_START"
  | "NO_VOICE"
  | "NO_PROXY"
  | "PROXY_BROKEN"
  | "NO_PROFILE"
  | "NOT_LOGGED_IN"
  | "NO_OWNER"
  | "NO_DEVICE"
  | "DEVICE_REVOKED"
  | "CLUSTER_DRIFT";

export interface ReadinessBlocker {
  code: ReadinessBlockerCode;
  /** Một cụm ngắn đủ đứng trong ô bảng: "chưa ghim máy". */
  label: string;
  /** Việc phải làm tiếp, viết ở dạng bấm/gõ được. */
  fix: string;
  /**
   * `true` = nick vẫn chạy được phần nào, chỉ là chưa trọn vẹn.
   *
   * Cold-start là ca duy nhất hiện tại: nick mở profile được, đọc được, tương tác nhẹ được —
   * chỉ chưa đăng bài được. Gộp nó chung với "chưa có proxy" là nói sai, vì một cái cần người
   * làm gì đó còn một cái chỉ cần chờ.
   */
  waitingOnly?: boolean;
}

export interface AccountReadiness {
  /** Không còn chặn nào (kể cả loại chờ). */
  ready: boolean;
  /** Chỉ còn chặn loại chờ — mở profile được, chưa đăng được. */
  waiting: boolean;
  blockers: ReadinessBlocker[];
  /** Một câu cho ô bảng và cho dải cảnh báo. */
  summary: string;
}

/** Đủ dữ liệu để chấm. Nhận hình dạng rời chứ không nhận model Prisma — để test khỏi dựng database. */
export interface ReadinessInput {
  platform: string;
  status: string;
  coldStartUntil: Date | null;
  /** `Account.voice` — xem blocker `NO_VOICE`. */
  voice: string | null;
  antidetectProfileId: string | null;
  /** `Account.firstLoginAt` — xem blocker `NOT_LOGGED_IN`. */
  firstLoginAt: Date | null;
  ownerId: string | null;
  proxy: { lastCheckVerdict: string | null } | null;
  device: { userId: string; revokedAt: Date | null } | null;
  now?: Date;
}

/**
 * Nick này có phải mở bằng trình duyệt antidetect không — tức có cần proxy / profile / máy.
 *
 * Hỏi ngược: **chỉ Facebook là không cần.** Fanpage đăng bằng Graph API có token chính thức,
 * không mở trình duyệt, không cần profile cấu hình, không đi qua proxy. Khai thêm thì vẫn dùng được
 * (README cho phép), nhưng không khai cũng không phải thiếu sót — nên chỉ đòi khi đã khai một
 * nửa (xem `NO_DEVICE`).
 *
 * Viết dạng loại trừ chứ không liệt kê (19/08/2026, lúc thêm TIKTOK). Bản cũ hỏi
 * `=== "REDDIT"`, nên nền tảng thứ ba vừa thêm vào đã lặng lẽ rơi vào nhánh "không cần trình
 * duyệt": nick TikTok không proxy, không profile, không máy vẫn được chấm là **sẵn sàng** —
 * một lời nói dối đúng vào chỗ nguy hiểm nhất. Dạng loại trừ cho mặc định AN TOÀN: nền tảng
 * mới thêm sau này rơi vào nhánh chặt, và nếu sai thì sai theo hướng đòi thừa chứ không phải
 * thả lỏng.
 */
function needsBrowserStack(platform: string): boolean {
  return platformFamily(platform) !== "FACEBOOK";
}

export function describeAccountReadiness(input: ReadinessInput): AccountReadiness {
  const blockers: ReadinessBlocker[] = [];
  const browserNick = needsBrowserStack(input.platform);

  // ── Trạng thái vòng đời ────────────────────────────────────────────────────
  const presentation = getStatusPresentation(input.status);
  if (!presentation.canLaunch) {
    blockers.push({
      code: "STATUS",
      label: presentation.label.toLowerCase(),
      fix: presentation.hint,
    });
  }

  const coldDays = coldStartDaysRemaining(input.coldStartUntil, input.now);
  if (coldDays > 0) {
    blockers.push({
      code: "COLD_START",
      label: `${coldDays} cold-start days remaining`,
      fix: "Read and interact lightly until cold-start ends. No setup change is needed; just wait.",
      waitingOnly: true,
    });
  }

  // ── Danh tính ──────────────────────────────────────────────────────────────
  //
  // Bộ luật KHÔNG đọc cột này — luật 7 so trùng văn bản thật (`rule-content-similarity.ts`). Nên
  // câu gợi ý dưới đây phải nói đúng việc nó làm: nhắc làn viết cho người sắp ngồi xuống viết,
  // trước khi họ viết. Hứa rằng "máy canh giọng hộ" là dạy người dùng tin vào một lớp gác không
  // tồn tại.
  if (!input.voice) {
    blockers.push({
      code: "NO_VOICE",
      label: "writing voice missing",
      fix:
        "Add the writing voice and content focus in the Edit nick card. The tool checks repeated " +
        "text only when you post; use these notes to keep the voice consistent before writing.",
    });
  }

  if (browserNick && !input.proxy) {
    blockers.push({
      code: "NO_PROXY",
      label: "proxy not assigned",
      fix: "Assign a proxy in the Edit nick card. Opening this nick without one would use your home IP.",
    });
  } else if (input.proxy && PROBLEM_VERDICTS.includes(input.proxy.lastCheckVerdict as never)) {
    // Proxy hỏng chặn mở profile ở `launch/route.ts`, nên nó là chặn thật chứ không phải cảnh báo.
    blockers.push({
      code: "PROXY_BROKEN",
      label: "proxy unavailable",
      fix: "Check or replace the proxy at /proxies. Its latest check reported that it is unavailable.",
    });
  }

  if (browserNick && !input.antidetectProfileId) {
    blockers.push({
      code: "NO_PROFILE",
      label: "browser profile missing",
      fix:
        'Select "Create browser profile on this Relay PC" on the nick details page. The tool ' +
        "includes the proxy and country-aligned locale and timezone, then assigns the nick to this " +
        "Relay PC. This is operational configuration, not proof of identity isolation.",
    });
  } else if (browserNick && !input.firstLoginAt) {
    // Profile có rồi nhưng chưa ai đăng nhập. Trạng thái này CHỈ tồn tại từ 07/08/2026: trước đó
    // id profile được dán vào sau khi đã đăng nhập tay xong, nên hai việc trùng nhau. Nút "Tạo
    // profile" đẻ ra một trình duyệt trắng tinh — có proxy và cài đặt profile, không một cookie nào.
    //
    // `else if` chứ không phải điều kiện rời: chưa có profile thì chưa có gì để đăng nhập vào, và
    // hiện hai dòng cùng lúc là bắt người đọc tự suy ra thứ tự giữa chúng.
    blockers.push({
      code: "NOT_LOGGED_IN",
      label: "first sign-in incomplete",
      fix:
        'Open the browser profile, sign in to the nick yourself, then select "Sign-in completed" ' +
        "in the First sign-in card. Do this early in cold-start because verification is most likely " +
        "on the first sign-in; the tool does not automate it.",
    });
  }

  // ── Cụm: người và máy ──────────────────────────────────────────────────────
  if (!input.ownerId) {
    blockers.push({
      code: "NO_OWNER",
      label: "nick owner not assigned",
      fix: "An administrator must assign an owner in the Nick assignment card. Only administrators can read secrets while the nick has no owner.",
    });
  }

  // Chỉ đòi máy khi nick THẬT SỰ cần trình duyệt. Nick Facebook đã khai profile antidetect thì
  // cũng cần — khai một nửa là trạng thái tệ nhất: có id profile mà không biết nó ở máy nào.
  const needsDevice = browserNick || input.antidetectProfileId !== null;

  if (needsDevice && !input.device) {
    blockers.push({
      code: "NO_DEVICE",
      label: "Relay PC not assigned",
      fix: "An administrator must assign a Relay PC in the Nick assignment card. A browser profile ID is valid only on the PC that created it.",
    });
  } else if (input.device?.revokedAt) {
    blockers.push({
      code: "DEVICE_REVOKED",
      label: "Relay PC revoked",
      fix: "An administrator must move the assignment to another Relay PC. A revoked PC cannot receive tickets.",
    });
  } else if (input.device && input.ownerId && input.device.userId !== input.ownerId) {
    blockers.push({
      code: "CLUSTER_DRIFT",
      label: "assignment mismatch",
      fix: "The assigned Relay PC does not belong to the nick owner. An administrator must correct the Nick assignment.",
    });
  }

  const waiting = blockers.length > 0 && blockers.every((blocker) => blocker.waitingOnly === true);

  return {
    ready: blockers.length === 0,
    waiting,
    blockers,
    summary: summarize(blockers, waiting),
  };
}

function summarize(blockers: ReadinessBlocker[], waiting: boolean): string {
  if (blockers.length === 0) return "Ready";
  if (waiting) return blockers.map((blocker) => blocker.label).join(", ");

  // Chặn thật lên trước, chặn loại chờ xuống sau: người đọc cần biết mình phải LÀM gì trước khi
  // biết mình phải CHỜ gì.
  const real = blockers.filter((blocker) => !blocker.waitingOnly);
  return real.map((blocker) => blocker.label).join(", ");
}
