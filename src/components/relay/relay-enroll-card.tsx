"use client";

/**
 * Ghi danh chiếc máy đang ngồi bằng hai cú bấm, thay cho bốn lượt chép tay.
 *
 * ## Vì sao có nút "Tìm cầu nối" thay vì tự dò lúc mở trang
 *
 * Ràng buộc 1 của spike GĐ0: lời gọi **đầu tiên** xuống `127.0.0.1` trên mỗi máy phải nằm trong
 * trình xử lý cú bấm, nếu không hộp xin quyền mạng nội bộ không hiện ra và request bị nuốt im.
 * Dò tự động lúc mở trang là cách chắc chắn để mọi máy mới đều thấy "không tìm thấy cầu nối".
 *
 * ## Thứ tự hai lời gọi, và vì sao không đảo được
 *
 * `deviceId` chỉ tồn tại **sau** khi khóa công khai đi lên và máy chủ ghi vào sổ. Nên luồng là
 * hai chiều: đọc khóa từ cầu nối → gửi lên → nhận mã máy về → đẩy ngược xuống cầu nối. Trình
 * duyệt làm người đưa thư ở cả hai chiều, đúng vai nó đã làm với vé.
 */
import { useState } from "react";
import { Field, SelectField } from "@/components/ui/form-controls";
import {
  configureRelay,
  describeRelayFailure,
  pingRelay,
  type RelayOutcome,
} from "@/lib/relay/relay-browser-client";
import type { RelayHealth, RelayReply } from "@/lib/relay/relay-endpoints";
import { enrollThisMachine } from "@/lib/tickets/relay-enrollment-actions";

interface TeamMember {
  id: string;
  email: string;
}

/** Cầu nối trên máy này đang ở đâu trong quá trình cài. */
type Found = { publicKey: string; configured: boolean; deviceId: string | null };

const NOTE_CLASS = "text-xs text-neutral-500";
const BUTTON_CLASS =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";

export function RelayEnrollCard({
  teamMembers,
  isAdmin,
}: {
  teamMembers: TeamMember[];
  isAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function findRelay() {
    setBusy(true);
    setMessage(null);

    const outcome: RelayOutcome<RelayHealth & RelayReply> = await pingRelay();

    // `rejected` KHÔNG phải thất bại ở đây, và đó là điểm mấu chốt: cầu nối chưa cấu hình trả về
    // `ok: false` kèm câu "chưa cấu hình xong" — tức đúng chiếc máy mà nút này sinh ra để phục vụ.
    // Coi nó là lỗi thì tính năng này không bao giờ chạy được lần nào.
    if (outcome.status === "ok" || outcome.status === "rejected") {
      // Đọc thân ở CẢ hai nhánh. Máy vừa cài xong luôn đi ra bằng nhánh `rejected` — `/health`
      // của nó trả `ok: false` vì cấu hình còn thiếu — nên chỉ đọc nhánh `ok` là bỏ đúng chiếc
      // máy cần đăng ký, và đó là mọi chiếc máy ở lần đầu.
      const data = outcome.data;
      if (data?.publicKey) {
        setFound({
          publicKey: data.publicKey,
          configured: data.configured ?? false,
          deviceId: data.deviceId ?? null,
        });
      } else {
        // Trả lời được mà không có khóa công khai thì thứ đang nghe ở cổng đó nhiều khả năng
        // không phải cầu nối. Kèm luôn câu nó vừa nói — đó là manh mối duy nhất còn lại.
        const said = outcome.status === "rejected" ? ` Nó nói: "${outcome.message}".` : "";
        setMessage({
          ok: false,
          text:
            "Có thứ gì đó đang trả lời ở cổng 47821 nhưng không khai khóa công khai, nên nhiều " +
            `khả năng nó không phải cầu nối.${said} Mở http://127.0.0.1:47821 trên máy này để ` +
            "xem trực tiếp.",
        });
      }
    } else {
      setMessage({ ok: false, text: describeRelayFailure(outcome) });
    }

    setBusy(false);
  }

  async function enroll(formData: FormData) {
    if (!found) return;
    setBusy(true);
    setMessage(null);

    formData.set("publicKey", found.publicKey);

    const result = await enrollThisMachine(null, formData);
    // `adminAction` có thể trả về lời từ chối của chính lớp gác — một `ActionResult` trần, không
    // mang `enrollment`. Thu hẹp kiểu ở đây thay vì ép: câu từ chối đó là câu người dùng cần đọc.
    const enrollment = "enrollment" in result ? result.enrollment : undefined;
    if (!result.ok || !enrollment) {
      setMessage({ ok: false, text: result.message });
      setBusy(false);
      return;
    }

    const pushed = await configureRelay(enrollment);
    if (pushed.status !== "ok") {
      setMessage({
        ok: false,
        text:
          `Đã ghi máy vào sổ, nhưng chưa gửi được cấu hình xuống cầu nối: ` +
          `${describeRelayFailure(pushed)} — bấm "Tìm cầu nối" rồi thử lại, sổ không bị ghi trùng.`,
      });
      setBusy(false);
      return;
    }

    setFound({ ...found, configured: true, deviceId: enrollment.deviceId });
    setMessage({ ok: true, text: pushed.data.message });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Cài <code className="font-mono text-xs">setup.bat</code> xong thì bấm nút dưới đây{" "}
        <strong>ngay trên chiếc máy vừa cài</strong>. Web app tự đọc khóa công khai của nó, ghi vào
        sổ, rồi gửi cấu hình ngược xuống — không phải chép tay giá trị nào.
      </p>

      {!found ? (
        <div className="space-y-2">
          <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={findRelay}>
            {busy ? "Đang tìm…" : "Tìm cầu nối trên máy này"}
          </button>
          <p className={NOTE_CLASS}>
            Lần đầu trên mỗi máy, Chrome sẽ hỏi quyền truy cập mạng nội bộ — chọn{" "}
            <strong>Cho phép</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Thấy cầu nối.{" "}
            <span className="font-mono text-xs text-neutral-500">
              {found.publicKey.slice(0, 12)}…{found.publicKey.slice(-12)}
            </span>
          </p>

          {found.configured ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Máy này đã cấu hình xong{found.deviceId ? ` (mã ${found.deviceId})` : ""}. Còn khóa
              vùng operator thì dán ở trang của chính cầu nối —{" "}
              <a className="underline" href="http://127.0.0.1:47821" target="_blank" rel="noopener">
                mở trang đó
              </a>
              . Máy chủ không có khóa ấy để gửi xuống.
            </p>
          ) : (
            <form action={enroll} className="space-y-4">
              <Field
                label="Tên máy"
                name="name"
                required
                placeholder="Laptop Dell của Hà"
                hint="Tới ngày phải thu hồi gấp, đây là thứ duy nhất để nhận ra máy nào là máy nào."
              />
              {/* OPERATOR không chọn chủ máy: máy họ đăng ký luôn thuộc về chính họ, và server
                  action ép điều đó chứ không dựa vào việc ô này có hiện hay không. */}
              {isAdmin ? (
                <SelectField
                  label="Người dùng máy"
                  name="userId"
                  required
                  options={teamMembers.map((member) => ({ value: member.id, label: member.email }))}
                  hint="Chỉ hiện người đã đăng nhập ít nhất một lần."
                />
              ) : (
                <p className={NOTE_CLASS}>
                  Máy này sẽ được ghi cho <strong>chính bạn</strong>. Cài hộ người khác là việc của
                  quản trị viên.
                </p>
              )}
              <button type="submit" className={BUTTON_CLASS} disabled={busy}>
                {busy ? "Đang ghi…" : "Đăng ký & cấu hình máy này"}
              </button>
            </form>
          )}
        </div>
      )}

      {message ? (
        <p
          className={
            message.ok
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-sm text-red-700 dark:text-red-400"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
