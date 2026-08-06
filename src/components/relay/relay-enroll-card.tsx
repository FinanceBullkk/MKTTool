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
 *
 * ## Bốn trạng thái, và vì sao `deviceId` mới là thứ phân biệt "đã vào sổ"
 *
 * `configured` của `/health` là **đủ CẢ BA giá trị**, kể cả khóa vùng operator. Một chiếc máy vừa
 * đăng ký xong nhưng chưa được cấp khóa vẫn trả `configured: false` — đúng, vì nó chưa làm được
 * việc gì thật. Dùng cờ đó để trả lời câu *"đã vào sổ chưa"* là gộp hai câu hỏi khác nhau, và
 * hệ quả là chiếc máy đang chờ khóa sẽ bị mời đăng ký lại lần nữa.
 *
 * Nên: `deviceId` trả lời *"đã vào sổ chưa"*, `configured` trả lời *"làm việc được chưa"*.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Field, SelectField } from "@/components/ui/form-controls";
import {
  configureRelay,
  describeRelayFailure,
  pingRelay,
  receiveOperatorKey,
  type RelayOutcome,
} from "@/lib/relay/relay-browser-client";
import { RELAY_ORIGIN, type RelayHealth, type RelayReply } from "@/lib/relay/relay-endpoints";
import {
  enrollThisMachine,
  markOperatorKeyReady,
  readOperatorKeyGrant,
} from "@/lib/tickets/relay-enrollment-actions";

interface TeamMember {
  id: string;
  email: string;
}

/** Cầu nối trên máy này đang ở đâu trong quá trình cài. */
type Found = { publicKey: string; configured: boolean; deviceId: string | null };

/**
 * Nhịp hỏi lại khi đang đợi quản trị viên cấp khóa.
 *
 * 10 giây: đủ thưa để không phải là một vòng lặp bận, đủ dày để người vừa được duyệt không phải
 * tự hỏi có nên tải lại trang không. Chỉ chạy ở đúng trạng thái đang chờ — xem `useEffect` bên dưới.
 */
const GRANT_POLL_MS = 10_000;

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
  /** Câu mô tả lượt đi lấy khóa gần nhất. Tách khỏi `message` vì nó tự đổi, không do ai bấm. */
  const [keyNote, setKeyNote] = useState<string | null>(null);
  /** Đã báo lên máy chủ rằng máy này có khóa chưa — chỉ báo một lần cho mỗi lượt mở trang. */
  const reported = useRef(false);

  /**
   * Đi lấy hộp khóa nếu có, mở nó ra, rồi báo lại cho sổ.
   *
   * Ba lời gọi nhưng người dùng không bấm gì cả: máy chủ giữ hộ → cầu nối mở → sổ ghi nhận. Chỗ
   * duy nhất khóa hiện ra dạng dùng được là bên trong cầu nối, đúng như mọi đường khác của GĐ3.
   */
  const pickUpKey = useCallback(async (deviceId: string) => {
    const askForm = new FormData();
    askForm.set("deviceId", deviceId);

    const waiting = await readOperatorKeyGrant(null, askForm);
    if (!waiting.ok) {
      setKeyNote(waiting.message);
      return;
    }
    // `guardedAction` có thể trả về lời từ chối của chính lớp gác — một `ActionResult` trần,
    // không mang hộp khóa. Thu hẹp kiểu thay vì ép, đúng như `enroll` làm với `enrollment`.
    const grant = "grant" in waiting ? waiting.grant : undefined;
    if (!grant) {
      setKeyNote(null);
      return;
    }

    const opened = await receiveOperatorKey(grant);
    if (opened.status !== "ok") {
      setKeyNote(`Nhận được khóa nhưng cầu nối chưa lưu được: ${describeRelayFailure(opened)}`);
      return;
    }

    // Chỉ báo lên sổ SAU khi cầu nối đã xác nhận lưu xong. Báo trước là xóa mất cái hộp của một
    // chiếc máy chưa thật sự nhận được nó, và lúc đó chỉ còn đường xin cấp lại.
    const doneForm = new FormData();
    doneForm.set("deviceId", deviceId);
    await markOperatorKeyReady(null, doneForm);

    reported.current = true;
    setFound((current) => (current ? { ...current, configured: true } : current));
    setKeyNote(null);
  }, []);

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

    // KHÔNG đặt `configured: true` ở đây. Máy vừa vào sổ và vừa nhận `deviceId`, nhưng khóa vùng
    // operator thì chưa — nó tới ở bước sau, và cờ này là thứ quyết định giao diện nói "xong" hay
    // "đang chờ". Đặt sớm là hứa hộ một việc chưa xảy ra.
    setFound({ ...found, deviceId: enrollment.deviceId });
    setMessage({ ok: true, text: pushed.data.message });
    setBusy(false);

    // Có thể quản trị viên đã cấp sẵn từ trước — hỏi luôn thay vì bắt đợi hết một nhịp.
    void pickUpKey(enrollment.deviceId);
  }

  /**
   * Đang chờ khóa thì tự hỏi lại, không bắt người dùng tải trang.
   *
   * Chỉ chạy khi đã vào sổ mà chưa đủ cấu hình — tức đúng một trạng thái. Ràng buộc 1 (LNA) không
   * bị vi phạm: tới được đây nghĩa là đã có một lượt ping thành công **từ một cú bấm**, nên quyền
   * mạng nội bộ đã được cấp và các lời gọi nền sau đó đi lọt.
   */
  useEffect(() => {
    const deviceId = found?.deviceId;
    if (!deviceId || found?.configured) return;

    // Nhịp đầu đẩy sang tick sau thay vì gọi thẳng trong thân effect: gọi thẳng là dựng một
    // chuỗi render nối đuôi nhau ngay lúc React đang commit, và đó cũng là thứ eslint chặn.
    const first = setTimeout(() => void pickUpKey(deviceId), 0);
    const timer = setInterval(() => void pickUpKey(deviceId), GRANT_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [found?.deviceId, found?.configured, pickUpKey]);

  /**
   * Máy đã đủ cấu hình mà sổ chưa biết → báo lên một lần.
   *
   * Đây là đường **dán tay**: chiếc máy đầu tiên của cả team lấy khóa ở trang trạng thái của cầu
   * nối, và máy chủ không thấy được việc đó. Không báo thì sổ hiện "chưa có khóa" cho một chiếc
   * máy đang chạy tốt — và người đọc sổ sẽ đi cấp lại một thứ đã có.
   */
  useEffect(() => {
    const deviceId = found?.deviceId;
    if (!deviceId || !found?.configured || reported.current) return;

    reported.current = true;
    const form = new FormData();
    form.set("deviceId", deviceId);
    void markOperatorKeyReady(null, form);
  }, [found?.deviceId, found?.configured]);

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
              Máy này đã sẵn sàng{found.deviceId ? ` (mã ${found.deviceId})` : ""}. Lấy mật khẩu,
              OTP và mở profile đều dùng được từ đây.
            </p>
          ) : found.deviceId ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                Đã ghi máy này vào sổ. <strong>Đang chờ quản trị viên cấp khóa</strong> — khóa tự
                về, trang này tự cập nhật, không phải làm gì thêm.
              </p>
              <p className={NOTE_CLASS}>
                Cần dùng ngay mà không đợi được thì dán tay khóa vùng operator ở{" "}
                <a className="underline" href={RELAY_ORIGIN} target="_blank" rel="noopener">
                  trang của chính cầu nối
                </a>
                . Đó cũng là đường duy nhất cho chiếc máy đầu tiên của cả team — lúc đó chưa có cầu
                nối nào khác để cấp khóa từ đó.
              </p>
              {keyNote ? (
                <p className="text-xs text-red-700 dark:text-red-400">{keyNote}</p>
              ) : null}
            </div>
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
