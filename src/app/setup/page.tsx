import Link from "next/link";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { readActor } from "@/lib/auth/require-actor";
import { loadSetupChecklist, type SetupStep } from "@/lib/setup/setup-checklist";

export const dynamic = "force-dynamic";

/**
 * Trang **Chuẩn bị** — trả lời đúng một câu: *"tôi đang thiếu gì để bắt đầu."*
 *
 * Tách khỏi trang Hôm nay vì hai trang trả lời hai câu khác nhau: Hôm nay là bảng vận hành của
 * một buổi làm việc, còn trang này là việc làm một lần lúc dựng kho. Nhồi chung thì việc dựng kho
 * — vốn có thứ tự bắt buộc và làm sai thì hỏng lâu — bị xếp dưới danh sách bài phải đăng hôm nay.
 */
const STATE_BADGE: Record<SetupStep["state"], { label: string; className: string }> = {
  done: {
    label: "Xong",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  partial: {
    label: "Đang dở",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  todo: {
    label: "Chưa làm",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

export default async function SetupPage() {
  const [checklist, viewer] = await Promise.all([loadSetupChecklist(), readActor()]);
  const isAdmin = viewer?.role === "ADMIN";
  const { steps, nextStepId, doneCount } = checklist;

  return (
    <>
      <PageHeading
        title="Chuẩn bị"
        description="Dựng kho theo đúng thứ tự này. Mỗi bước đọc trạng thái thật từ kho, nên trang này không bao giờ nói sai về việc đã làm tới đâu."
      />

      <Card title={`Tiến độ — ${doneCount}/${steps.length} bước`}>
        {nextStepId === null ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Đủ cả {steps.length} bước. Từ giờ dùng{" "}
            <Link href="/" className="underline">
              trang Hôm nay
            </Link>{" "}
            làm màn hình chính — trang này chỉ cần quay lại khi thêm người hoặc thêm máy mới.
          </p>
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Thứ tự bên dưới là <strong>ràng buộc thật, không phải gợi ý</strong>. Làm nhảy cóc thì
            bước sau sẽ chặn: chưa có cầu nối thì không tạo nổi nick có bí mật, chưa có proxy thì
            không thêm được nick Reddit.
          </p>
        )}
      </Card>

      <ol className="space-y-3">
        {steps.map((step, index) => {
          const badge = STATE_BADGE[step.state];
          const isNext = step.id === nextStepId;
          const locked = step.adminOnly && !isAdmin;

          return (
            <li
              key={step.id}
              className={
                "rounded-lg border p-4 " +
                (isNext
                  ? "border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900"
                  : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900")
              }
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-neutral-500">Bước {index + 1}</span>
                <span className="font-medium">{step.title}</span>
                <StatusBadge label={badge.label} className={badge.className} />
                {isNext ? (
                  <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                    ← làm tiếp cái này
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-sm">{step.status}</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{step.why}</p>

              <div className="mt-3 text-sm">
                {locked ? (
                  // Nói rõ vì sao không bấm được, thay vì giấu nút đi. Giấu thì người đọc kết luận
                  // là công cụ hỏng, và họ không có cách nào biết phải đi nhờ ai.
                  <span className="text-neutral-500">
                    Bước này do quản trị viên làm — nhắn họ nếu đang chờ.
                  </span>
                ) : (
                  <Link href={step.href} className="underline">
                    {step.linkLabel} →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Card title="Cài cầu nối trên máy của bạn">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Mỗi người vận hành Reddit cần cầu nối chạy trên <strong>chính máy mình đang ngồi</strong>
          . Nó là chỗ duy nhất trong cả hệ thống mở được mật khẩu nick — máy chủ không mở được, kể
          cả quản trị viên ngồi trên máy chủ cũng không.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/relay-download" className="underline">
            Tải bộ cài
          </Link>{" "}
          rồi{" "}
          <Link href="/relay-devices" className="underline">
            đăng ký máy này
          </Link>{" "}
          — hai việc, không phải chép mã nào cho nhau.
        </p>
      </Card>
    </>
  );
}
