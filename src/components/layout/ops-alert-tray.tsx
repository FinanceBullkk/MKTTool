/**
 * Khay cảnh báo vận hành — vùng cố định ngay dưới thanh đầu trang, hiện ở mọi trang.
 *
 * Vẽ mỗi vấn đề một dòng riêng với việc phải làm riêng. Xem `ops-alert-types.ts` để biết vì sao
 * là một vùng nhiều mục thay vì nhiều dải rời, và vì sao khay này tách khỏi các dải cảnh báo
 * về dữ liệu ở trang Hôm nay.
 *
 * Chưa đăng nhập thì không vẽ gì: cảnh báo cấu hình không dành cho người chưa vào được.
 */
import { readActor } from "@/lib/auth/require-actor";
import { collectOpsAlerts } from "@/lib/ops-alerts/collect-ops-alerts";
import type { OpsAlertTone } from "@/lib/ops-alerts/ops-alert-types";

/**
 * Cùng bảng màu với `AlertBanner`, nhưng không dùng lại component đó: khay là DANH SÁCH nhiều
 * dòng trong một khung, còn `AlertBanner` là một khung cho một câu. Ép chung sẽ ra một chồng
 * khung viền lồng nhau.
 */
const TONE_CLASS: Record<OpsAlertTone, string> = {
  amber: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
  red: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950",
};

const TONE_TEXT_CLASS: Record<OpsAlertTone, string> = {
  amber: "text-amber-900 dark:text-amber-300",
  red: "text-red-800 dark:text-red-300",
};

const TONE_LABEL: Record<OpsAlertTone, string> = {
  amber: "Chú ý",
  red: "Đang hỏng",
};

export async function OpsAlertTray() {
  const actor = await readActor();
  if (!actor) return null;

  const alerts = collectOpsAlerts(actor.role);
  if (alerts.length === 0) return null;

  return (
    // `role="status"` chứ không phải `alert`: khay có mặt sẵn lúc trang nạp, không phải thứ
    // vừa xảy ra cần cắt ngang người dùng.
    <section role="status" aria-label="Cảnh báo vận hành" className="mb-8 space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-md border px-4 py-3 ${TONE_CLASS[alert.tone]}`}
        >
          <div className={`text-sm ${TONE_TEXT_CLASS[alert.tone]}`}>
            <span className="mr-2 rounded bg-white/60 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide dark:bg-black/30">
              {TONE_LABEL[alert.tone]}
            </span>
            {alert.message}
            {/* Việc phải làm tách dòng riêng — gộp vào cuối câu thì nó bị đọc lướt qua cùng
                phần mô tả, và cảnh báo không ai làm gì tiếp là cảnh báo vô ích. */}
            <p className="mt-1.5 font-medium">{alert.action}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
