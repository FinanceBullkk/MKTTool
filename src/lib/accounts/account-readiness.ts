/**
 * **Nick này đã dùng được chưa, và nếu chưa thì thiếu gì.**
 *
 * ## Vì sao cần một hàm riêng cho câu hỏi này
 *
 * Điều kiện dùng được một nick nằm rải ở bảy cột thuộc bốn bảng. Trước khi có file này, người
 * dùng phải tự ghép chúng từ bảng "Thông tin" 15 dòng ở trang chi tiết — và trang danh sách thì
 * không nói gì cả. Kết quả là *"bấm nút mới biết"*, đúng kiểu hỏng mà cả dự án tránh ở chỗ khác
 * (proxy "chưa kiểm lần nào" không hiện như đang khỏe; bộ dò "không dò được" không báo là "khỏe").
 *
 * Một hàm thuần, ba chỗ đọc: cột **Sẵn sàng** ở `/accounts`, dải trạng thái ở trang chi tiết nick,
 * và dải cảnh báo ở trang Hôm nay. Ba chỗ mà tự ghép riêng thì sớm muộn ba chỗ nói ba kiểu.
 *
 * ## Điều kiện KHÁC NHAU theo nền tảng, và đó là điểm chính
 *
 * Nick Reddit phải lén: mỗi nick một proxy, một vân tay, một máy. Fanpage đăng bằng Graph API có
 * token chính thức — không mở trình duyệt, không proxy, không profile, nên **không có máy nào để
 * ghim**. Đòi đủ bảy điều kiện cho nick Facebook là bịa ra ba lỗi vĩnh viễn không sửa được, và
 * người đọc sẽ học cách phớt lờ cả cột.
 *
 * Ranh giới này đã có sẵn ở `validatePlatformIdentityFields()` và ở `launch/route.ts`; file này
 * đọc cùng một ranh giới chứ không dựng ranh giới mới.
 */
import { platformFamily } from "@/lib/platforms/platform-family";
import { PROBLEM_VERDICTS } from "@/lib/proxies/proxy-liveness-verdict";
import { coldStartDaysRemaining, getStatusPresentation } from "./account-status";

/** Mã lý do — dùng làm `key` lúc vẽ danh sách và làm mỏ neo trong test. Đừng đổi khi sửa câu chữ. */
export type ReadinessBlockerCode =
  | "STATUS"
  | "COLD_START"
  | "NO_PERSONA"
  | "NO_PROXY"
  | "PROXY_BROKEN"
  | "NO_PROFILE"
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
  personaId: string | null;
  antidetectProfileId: string | null;
  ownerId: string | null;
  proxy: { lastCheckVerdict: string | null } | null;
  device: { userId: string; revokedAt: Date | null } | null;
  now?: Date;
}

/**
 * Nick Facebook cần proxy / profile / máy không.
 *
 * Không: Fanpage đăng bằng Graph API. Khai thêm thì vẫn dùng được (README cho phép), nhưng
 * **không khai cũng không phải thiếu sót** — nên chỉ đòi khi đã khai một nửa (xem `NO_DEVICE`).
 */
function needsBrowserStack(platform: string): boolean {
  return platformFamily(platform) === "REDDIT";
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
      label: `cold-start còn ${coldDays} ngày`,
      fix: "Chỉ đọc và tương tác nhẹ tới hết cold-start. Không cần làm gì, chỉ chờ.",
      waitingOnly: true,
    });
  }

  // ── Danh tính ──────────────────────────────────────────────────────────────
  if (!input.personaId) {
    blockers.push({
      code: "NO_PERSONA",
      label: "chưa có nhân vật",
      fix: "Gán nhân vật ở thẻ Sửa nick — bộ luật trùng nội dung đọc giọng của nhân vật.",
    });
  }

  if (browserNick && !input.proxy) {
    blockers.push({
      code: "NO_PROXY",
      label: "chưa gắn proxy",
      fix: "Gán proxy ở thẻ Sửa nick. Nick Reddit không proxy là nick chạy bằng IP nhà.",
    });
  } else if (input.proxy && PROBLEM_VERDICTS.includes(input.proxy.lastCheckVerdict as never)) {
    // Proxy hỏng chặn mở profile ở `launch/route.ts`, nên nó là chặn thật chứ không phải cảnh báo.
    blockers.push({
      code: "PROXY_BROKEN",
      label: "proxy hỏng",
      fix: "Kiểm hoặc đổi proxy ở /proxies. Lần kiểm gần nhất nói proxy này không dùng được.",
    });
  }

  if (browserNick && !input.antidetectProfileId) {
    blockers.push({
      code: "NO_PROFILE",
      label: "chưa có profile antidetect",
      fix: "Tạo profile trong MultiZen rồi dán id của nó vào thẻ Sửa nick.",
    });
  }

  // ── Cụm: người và máy ──────────────────────────────────────────────────────
  if (!input.ownerId) {
    blockers.push({
      code: "NO_OWNER",
      label: "chưa có người phụ trách",
      fix: "Quản trị viên gán ở thẻ Phân công cụm. Nick không chủ thì chỉ ADMIN mở được bí mật.",
    });
  }

  // Chỉ đòi máy khi nick THẬT SỰ cần trình duyệt. Nick Facebook đã khai profile antidetect thì
  // cũng cần — khai một nửa là trạng thái tệ nhất: có id profile mà không biết nó ở máy nào.
  const needsDevice = browserNick || input.antidetectProfileId !== null;

  if (needsDevice && !input.device) {
    blockers.push({
      code: "NO_DEVICE",
      label: "chưa ghim máy",
      fix: "Quản trị viên gán ở thẻ Phân công cụm. Id profile chỉ có nghĩa trên đúng máy tạo ra nó.",
    });
  } else if (input.device?.revokedAt) {
    blockers.push({
      code: "DEVICE_REVOKED",
      label: "máy đã bị thu hồi",
      fix: "Quản trị viên gán cụm sang một máy khác — máy đã thu hồi không nhận được vé nào.",
    });
  } else if (input.device && input.ownerId && input.device.userId !== input.ownerId) {
    blockers.push({
      code: "CLUSTER_DRIFT",
      label: "cụm lệch",
      fix: "Máy đang ghim không thuộc chủ nick. Quản trị viên gán lại cụm cho khớp.",
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
  if (blockers.length === 0) return "Sẵn sàng";
  if (waiting) return blockers.map((blocker) => blocker.label).join(", ");

  // Chặn thật lên trước, chặn loại chờ xuống sau: người đọc cần biết mình phải LÀM gì trước khi
  // biết mình phải CHỜ gì.
  const real = blockers.filter((blocker) => !blocker.waitingOnly);
  return real.map((blocker) => blocker.label).join(", ");
}
