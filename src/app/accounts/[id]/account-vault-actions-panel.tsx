"use client";

/**
 * Panel thao tác kho danh tính: mật khẩu, mã OTP, mở profile.
 *
 * ## Trang này không còn chạm vào bí mật, và không phải vì lịch sự
 *
 * Bản cũ gọi server action rồi nhận mật khẩu dạng trần về, chép vào clipboard. Nghĩa là mật khẩu
 * đi qua bộ nhớ của một trang web hosted — chỗ mà một script chèn được, một extension, hay chính
 * máy chủ bị chiếm đều đọc được. Nay nó chỉ cầm một tấm **vé**: một chuỗi đã mã hóa cho riêng
 * chiếc máy đang ngồi, hết hạn sau 30 giây. Mở devtools lúc bấm nút thì đó là tất cả những gì
 * thấy được.
 *
 * ## Hai kiểu gọi cầu nối, và vì sao phải là hai (QĐ 3)
 *
 * | Việc | Đường đi | Vì sao |
 * |---|---|---|
 * | Mật khẩu, OTP | **mở tab** của cầu nối | Tab đó **cùng nguồn với cầu nối** nên không dính luật Local Network Access — lấy được mật khẩu kể cả trên máy chưa bấm "Cho phép". Và bí mật hiện ra ở tab của cầu nối, không bao giờ vào trang web |
 * | Mở profile | fetch ngầm | Không có gì để hiện cho người dùng xem; mở thêm một tab trống chỉ để đóng lại là phiền |
 *
 * ## Ràng buộc 1 của spike GĐ0 nằm ở đâu trong file này
 *
 * Ở `launchProfile()`: `pingRelay()` là **dòng đầu tiên và không được await**. Xem chú thích đầu
 * `relay-browser-client.ts` — sai chỗ này thì trên chiếc máy chưa cấp quyền, hộp xin quyền không
 * bao giờ hiện ra và nút im lặng mãi mãi.
 *
 * `openSecretTab()` cũng ping, nhưng **cố ý đặt sau `await`** để hộp xin quyền *không* hiện ra.
 * Hai chỗ ngược nhau vì hai việc cần hai thứ khác nhau: mở profile **cần** quyền đó, còn lấy mật
 * khẩu thì không — ping ở đây chỉ để phân biệt "cầu nối chưa chạy" với "đang chạy". Xem chú thích
 * ngay tại chỗ gọi.
 *
 * ## Mở profile chạy LÂU, và hạn giờ mặc định không hợp với nó
 *
 * Cầu nối phải đẩy proxy vào profile rồi bật một cửa sổ Chromium thật — hai lượt làm việc nặng.
 * Với hạn giờ 4 giây mặc định, trang này bỏ cuộc trong khi cửa sổ vẫn đang mở ra, rồi báo *"trình
 * duyệt không cho trang này gọi xuống máy"*. Đã vấp thật 07/08/2026: profile hiện `running` bên
 * MultiZen trong lúc màn hình báo hỏng. Xem `RELAY_PROFILE_WORK_TIMEOUT_MS`.
 */
import { useState } from "react";
import {
  requestCredentialTicket,
  requestOtpTicket,
} from "@/lib/accounts/vault-credential-actions";
import { RelayOutdatedNotice } from "@/components/relay/relay-outdated-notice";
import {
  describeRelayFailure,
  describeSlowRelayFailure,
  outdatedRelayVersion,
  pingRelay,
  sendTicketToRelay,
  type RelayOutcome,
} from "@/lib/relay/relay-browser-client";
import { RELAY_PROFILE_WORK_TIMEOUT_MS, relaySecretUrl } from "@/lib/relay/relay-endpoints";

type Feedback = { kind: "ok" | "error"; text: string } | null;

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition " +
  "hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

/**
 * Cửa sổ nhỏ vừa đủ cho một mật khẩu và một nút chép.
 *
 * **Không có `noopener` trong chuỗi này, và đó là chuyện bắt buộc:** theo đặc tả HTML, `noopener`
 * nằm trong phần features làm `window.open()` trả về `null` — cùng giá trị với lúc bị bộ chặn
 * popup chặn. Bản đầu có nó, nên nhánh "chặn popup" ăn **mọi** cú bấm và không ai lấy được mật
 * khẩu; không lộ ra sớm vì phần này chỉ nghiệm thu được khi cầu nối đã chạy thật.
 *
 * Chỗ dựa thay thế là `disownPopup()` bên dưới.
 */
const SECRET_WINDOW_FEATURES = "width=460,height=360";

const POPUP_BLOCKED_MESSAGE =
  "Trình duyệt chặn cửa sổ bật lên, nên không mở được tab của cầu nối. Cho phép popup cho trang " +
  "này rồi bấm lại — bí mật chỉ hiện ở tab do cầu nối phục vụ, không hiện trên trang này.";

/**
 * Cắt đường `window.opener` từ cửa sổ vừa mở về trang này.
 *
 * Làm được là nhờ cửa sổ mới còn đang ở `about:blank` — lúc này nó **cùng nguồn** với trang này
 * nên gán được. Sau khi nó chuyển sang `127.0.0.1` thì cùng phép gán đó bị chặn vì khác nguồn.
 * Thứ tự "mở → cắt → mới điều hướng" là điều kiện để nó chạy, không phải sở thích sắp xếp.
 *
 * Cắt xong vẫn giữ nguyên handle để điều hướng — đó chính là thứ `noopener` lấy mất.
 */
function disownPopup(win: Window) {
  try {
    win.opener = null;
  } catch {
    // Không cắt được thì vẫn mở tiếp: trang sắp nạp vào đó là trang của chính cầu nối, và cái
    // nó với tới qua `opener` cũng chỉ là những việc mà một trang khác nguồn được phép làm.
  }
}

/**
 * Câu thay thế khi ping biết chắc cầu nối chưa chạy.
 *
 * Nói luôn cả chuyện phải bấm lại: vé sống 30 giây, nên bật cầu nối rồi bấm F5 ở cửa sổ kia là
 * đi vào câu "vé đã quá hạn" — đúng kỹ thuật nhưng dẫn người ta đi sai một vòng.
 */
const RELAY_DOWN_AFTER_OPEN =
  "Cầu nối chưa chạy trên máy này, nên cửa sổ vừa mở chỉ báo lỗi kết nối. Mở ứng dụng cầu nối " +
  "rồi bấm lại nút vừa bấm — vé cũ hết hạn sau 30 giây nên tải lại cửa sổ kia không cứu được.";

export interface RelayDeviceOption {
  id: string;
  name: string;
}

export function AccountVaultActionsPanel({
  accountId,
  hasTotp,
  hasOwnPassword,
  usesGoogleLogin,
  canLaunch,
  launchBlockedReason,
  relayDevices,
  nickDeviceName,
}: {
  accountId: string;
  hasTotp: boolean;
  /**
   * `Account.passwordEnc` có giá trị không.
   *
   * Đọc thẳng cột chứ **không** suy theo nền tảng: nick Reddit đăng nhập bằng Google nên cột này
   * là NULL với mọi nick tạo sau 07/08/2026, nhưng một nick cũ lỡ lưu mật khẩu thật thì vẫn phải
   * lấy lại được. Suy theo nền tảng là khóa mất đường tới một bí mật đang nằm trong kho.
   */
  hasOwnPassword: boolean;
  /** Đổi tên nút cho đúng thứ nó phát ra: mật khẩu Google, không phải "mật khẩu email" chung chung. */
  usesGoogleLogin: boolean;
  canLaunch: boolean;
  launchBlockedReason: string;
  /**
   * Máy chạy cầu nối đang dùng của **người đang xem**.
   *
   * Chỉ còn dùng cho nick **chưa ghim máy** — xem `nickDeviceName`. Nick đã ghim thì máy chủ tự
   * biết gửi vé đi đâu và không hỏi gì cả.
   */
  relayDevices: RelayDeviceOption[];
  /**
   * Tên chiếc máy đang giữ nick, `null` nếu nick chưa ghim máy nào.
   *
   * Có giá trị thì mọi vé bay về đó bất kể ai bấm, nên ô "máy bạn đang ngồi" biến mất: nó chỉ
   * gợi ra một lựa chọn không tồn tại.
   */
  nickDeviceName: string | null;
}) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  // Một máy thì không hỏi; nhiều máy thì máy mới nhất là mặc định hợp lý nhất — người vừa cài
  // thêm một máy thường đang ngồi ở chính nó.
  const [deviceId, setDeviceId] = useState(relayDevices[0]?.id ?? "");
  const [outdatedVersion, setOutdatedVersion] = useState<number | null>(null);

  /**
   * Ghi lại phiên bản cầu nối mỗi lần nó trả lời được.
   *
   * Gọi ở **mọi** lối ra, kể cả lối bị từ chối: một chiếc máy chạy bản quá cũ tới mức vé bị chặn
   * chính là chiếc máy cần thấy dải cảnh báo nhất. Chỉ **bật lên**, không tắt: cầu nối tắt giữa
   * chừng thì lượt gọi sau không có số phiên bản nào, mà "không hỏi được" không phải bằng chứng
   * là máy đã cập nhật.
   */
  function noteRelayVersion(outcome: RelayOutcome<unknown>) {
    const old = outdatedRelayVersion(outcome);
    if (old !== null) setOutdatedVersion(old);
  }

  /**
   * Ping chạy song song, dùng để **đổi câu báo** sau khi tab đã mở — không chặn đường mở tab.
   *
   * ## Vì sao chỉ nghe nhánh `unreachable`
   *
   * Tab bí mật cùng nguồn với cầu nối nên **không dính luật Local Network Access**, trong khi
   * `pingRelay()` bắn từ chính trang này thì có. Nghĩa là `no-permission` (ping treo tới hết
   * hạn giờ) hoàn toàn có thể đi kèm một tab chạy ngon lành — báo hỏng ở đó là dựng một câu sai
   * ngay trên màn hình của người vừa lấy được mật khẩu. `unreachable` thì ngược lại: không ai
   * nghe ở cổng đó, nên tab kia chắc chắn cũng không nạp được gì.
   *
   * ## Vì sao so bằng `===`
   *
   * Ping có thể về sau khi người dùng đã bấm nút khác. So đúng object câu báo mình vừa đặt là
   * cách chắc chắn không đè lên câu của lượt bấm sau — một phép so nội dung sẽ đè nhầm ngay lần
   * ai đó bấm hai lần cùng một nút.
   */
  function replaceMessageIfRelayIsDown(ping: Promise<RelayOutcome<unknown>>, opened: Feedback) {
    void ping.then((health) => {
      noteRelayVersion(health);
      if (health.status !== "unreachable") return;
      setFeedback((current) =>
        current === opened ? { kind: "error", text: RELAY_DOWN_AFTER_OPEN } : current,
      );
    });
  }

  /**
   * Mở tab của cầu nối kèm vé.
   *
   * Cửa sổ được mở **trước** khi xin vé, lúc cú bấm còn nguyên giá trị: mở sau một vòng `await`
   * là rơi thẳng vào bộ chặn popup của mọi trình duyệt. Xin vé hỏng thì đóng lại ngay.
   */
  async function openSecretTab(request: () => Promise<unknown>, label: string) {
    const win = window.open("", "_blank", SECRET_WINDOW_FEATURES);
    if (!win) {
      setFeedback({ kind: "error", text: POPUP_BLOCKED_MESSAGE });
      return;
    }
    disownPopup(win);

    setBusy(true);
    setFeedback(null);
    try {
      const result = (await request()) as
        | { ticket: string; deviceName: string }
        | { ok: false; message: string };

      if ("ok" in result) {
        win.close();
        setFeedback({ kind: "error", text: result.message });
        return;
      }

      win.location.href = relaySecretUrl(result.ticket);

      const opened: Feedback = {
        kind: "ok",
        text:
          `Đã gửi vé ${label} sang máy "${result.deviceName}". Cửa sổ vừa mở là của cầu nối trên ` +
          `máy bạn — trang này không đọc được thứ hiện trong đó.`,
      };
      setFeedback(opened);

      // ⚠️ Bắn ở ĐÂY, tức sau `await` — ngược hẳn `launchProfile()`, và cố ý. Kích hoạt người
      // dùng đã mất ở vòng await trên, nên lời gọi này **không làm hiện hộp xin quyền mạng nội
      // bộ**. Đúng thứ cần: đường lấy mật khẩu không cần quyền đó (tab kia cùng nguồn với cầu
      // nối), mà một hộp xin quyền hiện lên giữa lúc người ta bấm "Mật khẩu nick" thì lý do duy
      // nhất để họ hiểu là "không biết, chặn đi" — và cú chặn ấy nằm lại, làm hỏng nút "Mở
      // profile" về sau. Không có quyền thì ping treo tới hết hạn giờ rồi ra `no-permission`,
      // nhánh mà `replaceMessageIfRelayIsDown` đã bỏ qua sẵn.
      replaceMessageIfRelayIsDown(pingRelay(), opened);
    } catch {
      win.close();
      setFeedback({
        kind: "error",
        text: `Không xin được vé ${label}. Tải lại trang rồi thử lại.`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function launchProfile() {
    // ⚠️ Dòng đầu, KHÔNG await — ràng buộc 1 của spike GĐ0. Xem chú thích đầu file.
    const ping = pingRelay();

    setBusy(true);
    setFeedback(null);
    try {
      // Không kèm deviceId nữa: vé mở profile bay về máy GIỮ NICK, và máy chủ tra sổ để biết đó
      // là máy nào. Xem resolveNickDeviceRecipient.
      const response = await fetch(`/api/accounts/${accountId}/launch`, { method: "POST" });
      const body = (await response.json()) as { ok: boolean; message: string; ticket?: string };

      if (!body.ok || !body.ticket) {
        setFeedback({ kind: "error", text: body.message });
        return;
      }

      // Hạn giờ dài: cầu nối phải đẩy proxy vào profile RỒI bật một cửa sổ Chromium thật — hai
      // lượt làm việc nặng, không phải một lượt hỏi đáp. Xem `RELAY_PROFILE_WORK_TIMEOUT_MS`.
      const sent = await sendTicketToRelay(body.ticket, RELAY_PROFILE_WORK_TIMEOUT_MS);
      noteRelayVersion(sent);

      if (sent.status === "ok") {
        setFeedback({ kind: "ok", text: `${sent.data.message} ${body.message}` });
        return;
      }

      // Hết hạn giờ ở đây KHÔNG có nghĩa profile chưa mở: đã vấp thật 07/08/2026 — cửa sổ Chromium
      // hiện lên bình thường trong khi trang này báo hỏng. Nên câu chữ phải nhắc chỗ nhìn để tự
      // phân xử, và tuyệt đối không giục bấm lại (bấm lại là mở hai cửa sổ cùng một nick).
      const health = await ping;
      setFeedback({
        kind: "error",
        text:
          sent.status === "no-permission"
            ? `${describeSlowRelayFailure(sent, "mở profile")} Nhìn màn hình xem có cửa sổ trình ` +
              `duyệt mới hiện ra không trước khi bấm lại.`
            : describeRelayFailure(sent, health),
      });
    } catch {
      setFeedback({ kind: "error", text: "Không gọi được API phát vé mở profile." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {outdatedVersion !== null ? <RelayOutdatedNotice relayVersion={outdatedVersion} /> : null}

      {nickDeviceName !== null ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Nick này ghim ở máy <strong>{nickDeviceName}</strong> — mọi vé bay về đó, kể cả khi
          người khác bấm. Đang ngồi máy khác thì công cụ nói thẳng chứ không mở ra một cửa sổ
          trống.
        </p>
      ) : null}

      {nickDeviceName === null && relayDevices.length === 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Máy bạn đang ngồi chưa có trong sổ cầu nối, nên chưa lấy được mật khẩu, mã OTP hay mở
          được profile. Cài cầu nối rồi nhờ quản trị viên ghi khóa công khai của nó vào sổ ở{" "}
          <a href="/relay-devices" className="underline">
            /relay-devices
          </a>
          .
        </p>
      ) : null}

      {nickDeviceName === null && relayDevices.length > 1 ? (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Máy bạn đang ngồi
          </span>
          <select
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            {relayDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">
            Vé được mã hóa cho đúng một máy. Chọn nhầm thì máy kia không mở được, và cầu nối sẽ
            nói thẳng là vé không phải của nó.
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/* Ẩn hẳn thay vì khóa lại: một nút xám thường trực gợi ra rằng nick này *đáng lẽ* có mật
            khẩu riêng và ai đó quên nhập. Nick đăng nhập bằng Google thì không có, và sẽ không
            bao giờ có. */}
        {hasOwnPassword ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busy}
            onClick={() =>
              openSecretTab(
                () => requestCredentialTicket(accountId, "password", deviceId || undefined),
                "mật khẩu nick",
              )
            }
          >
            Mật khẩu nick
          </button>
        ) : null}
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy}
          onClick={() =>
            openSecretTab(
              () => requestCredentialTicket(accountId, "emailPassword", deviceId || undefined),
              usesGoogleLogin ? "mật khẩu Google" : "mật khẩu email",
            )
          }
        >
          {usesGoogleLogin ? "Mật khẩu Google" : "Mật khẩu email"}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy || !hasTotp}
          onClick={() =>
            openSecretTab(() => requestOtpTicket(accountId, deviceId || undefined), "mã OTP")
          }
        >
          {hasTotp ? "Mã OTP" : "Chưa có 2FA"}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy || !canLaunch}
          onClick={launchProfile}
          title={canLaunch ? undefined : launchBlockedReason}
        >
          Mở profile
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Mật khẩu và mã OTP hiện ở một cửa sổ nhỏ do <strong>cầu nối trên máy bạn</strong> phục vụ,
        không phải trang này. Trang này chỉ cầm tấm vé đã mã hóa — nó không đọc được thứ nó vừa
        chuyển đi.
      </p>

      {!canLaunch ? (
        <p className="text-sm text-red-700 dark:text-red-400">{launchBlockedReason}</p>
      ) : null}

      {feedback ? (
        <p
          className={
            feedback.kind === "ok"
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-sm text-red-700 dark:text-red-400"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
