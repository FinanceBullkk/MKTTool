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
 * The Relay must apply the proxy to the profile and then open a real Chromium window, both of
 * which are expensive operations. With the default four-second timeout, this page gives up while
 * the window is still opening and reports that the browser blocked access to the local machine.
 * This happened on 2026-08-07: the MKT Browser profile was `running` while the UI reported a
 * failure. See `RELAY_PROFILE_WORK_TIMEOUT_MS`.
 */
import { useState } from "react";
import { KeyRound, Monitor, MonitorUp, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  requestCredentialTicket,
  requestOtpTicket,
} from "@/lib/accounts/vault-credential-actions";
import { RelayOutdatedNotice } from "@/components/relay/relay-outdated-notice";
import {
  Disclosure,
  PRIMARY_BUTTON_CLASS,
  SMALL_BUTTON_CLASS,
} from "@/components/ui/page-section";
import {
  describeRelayFailure,
  describeSlowRelayFailure,
  outdatedRelayVersion,
  pingRelay,
  sendTicketToRelay,
  type RelayOutcome,
} from "@/lib/relay/relay-browser-client";
import { describeProfileLaunchFailure } from "@/lib/relay/profile-launch-readiness";
import { RELAY_PROFILE_WORK_TIMEOUT_MS, relaySecretUrl } from "@/lib/relay/relay-endpoints";
import type { RelayOperationDiagnostic } from "@/lib/relay/relay-endpoints";
import { RelayOperationDiagnosticDetails } from "@/components/relay/relay-operation-diagnostic-details";

type Feedback = {
  kind: "ok" | "error";
  text: string;
  diagnostic?: RelayOperationDiagnostic;
} | null;

const BUTTON_CLASS = `${SMALL_BUTTON_CLASS} min-h-11 justify-start gap-2 text-sm`;

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
  "Your browser blocked the Relay window. Allow popups for this site and try again; secrets are " +
  "shown only in the Relay window, never on this page.";

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
  "Relay is not running on this PC, so the new window can only show a connection error. Start " +
  "Relay and select the action again; the old ticket expires after 30 seconds.";

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
          `Sent the ${label} ticket to Relay PC "${result.deviceName}". The new window belongs to ` +
          `Relay on that PC; this page cannot read its contents.`,
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
        text: `Could not request the ${label} ticket. Refresh the page and try again.`,
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
        setFeedback({
          kind: "ok",
          text: `${sent.data.message} ${body.message}`,
          diagnostic: sent.data.diagnostic,
        });
        return;
      }

      // Hết hạn giờ ở đây KHÔNG có nghĩa profile chưa mở: đã vấp thật 07/08/2026 — cửa sổ Chromium
      // hiện lên bình thường trong khi trang này báo hỏng. Nên câu chữ phải nhắc chỗ nhìn để tự
      // phân xử, và tuyệt đối không giục bấm lại (bấm lại là mở hai cửa sổ cùng một nick).
      const health = await ping;
      setFeedback({
        kind: "error",
        text:
          sent.status === "timeout"
            ? `${describeSlowRelayFailure(sent, "open browser profile")} Check for a new browser ` +
              `window before trying again; a delayed response may mean it already opened.`
            : // Cầu nối TỪ CHỐI: đọc mã, đừng chép lại câu của nó. Câu đó ghép từ `describe(error)`
              // của adapter (`relay/src/launch-profile.ts`), nên nó mang theo chuỗi kết nối proxy và
              // bất cứ thứ gì engine kèm vào lỗi — đúng thứ `describeProfileLaunchFailure()` được
              // viết ra để KHÔNG chuyển tiếp. Bảng profile đã lọc từ đầu; hai nút mở cùng một
              // profile không thể một nút lọc một nút không. Mã `NO_CAPACITY` cũng chỉ đến được
              // người dùng qua lớp này: một key CloakBrowser mở được đúng một phiên, và lượt mở
              // thứ hai bị từ chối trông y hệt một lần hỏng không rõ lý do.
              sent.status === "rejected"
              ? describeProfileLaunchFailure(sent)
              : describeRelayFailure(sent, health),
        diagnostic: sent.status === "rejected" ? sent.data?.diagnostic : undefined,
      });
    } catch {
      setFeedback({ kind: "error", text: "Could not request a browser profile launch ticket." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {outdatedVersion !== null ? <RelayOutdatedNotice relayVersion={outdatedVersion} /> : null}

      {nickDeviceName !== null ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-400">
            <Monitor size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
              Ticket destination
            </p>
            <p className="truncate text-sm font-semibold text-neutral-200">{nickDeviceName}</p>
          </div>
        </div>
      ) : null}

      {nickDeviceName === null && relayDevices.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-3 text-sm text-amber-100">
          <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            This PC is not registered. Complete <a href="/setup" className="font-semibold underline">Setup</a>{" "}
            before requesting secrets or opening a browser profile.
          </p>
        </div>
      ) : null}

      {nickDeviceName === null && relayDevices.length > 1 ? (
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-medium text-neutral-400">
            Relay PC you are using
          </span>
          <select
            className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3 text-base text-white outline-none focus:border-amber-400/50 sm:text-sm"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            {relayDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                "nick password",
              )
            }
          >
            <KeyRound size={15} aria-hidden="true" />
            Nick password
          </button>
        ) : null}
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy}
          onClick={() =>
            openSecretTab(
              () => requestCredentialTicket(accountId, "emailPassword", deviceId || undefined),
              usesGoogleLogin ? "Google password" : "email password",
            )
          }
        >
          <KeyRound size={15} aria-hidden="true" />
          {usesGoogleLogin ? "Google password" : "Email password"}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy || !hasTotp}
          onClick={() =>
            openSecretTab(() => requestOtpTicket(accountId, deviceId || undefined), "OTP code")
          }
        >
          <ShieldCheck size={15} aria-hidden="true" />
          {hasTotp ? "OTP code" : "2FA not configured"}
        </button>
        <button
          type="button"
          className={`${PRIMARY_BUTTON_CLASS} justify-center`}
          disabled={busy || !canLaunch}
          onClick={launchProfile}
          title={canLaunch ? undefined : launchBlockedReason}
        >
          <MonitorUp size={16} aria-hidden="true" />
          Open browser profile
        </button>
      </div>

      <Disclosure summary="How secure actions work" icon={ShieldCheck}>
        <ul className="space-y-2 text-xs leading-5">
          <li>Passwords and OTP codes open in Relay on the assigned PC, never inside this web page.</li>
          <li>Opening a browser profile remains a local, human-controlled action and is not identity-isolation proof.</li>
        </ul>
      </Disclosure>

      {!canLaunch ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-sm text-red-200">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{launchBlockedReason}</p>
        </div>
      ) : null}

      {feedback ? (
        <div
          role="status"
          className={`space-y-2 rounded-xl border px-3 py-3 ${
            feedback.kind === "ok"
              ? "border-emerald-400/20 bg-emerald-400/[0.06]"
              : "border-red-400/20 bg-red-400/[0.06]"
          }`}
        >
          <p
            className={
              feedback.kind === "ok"
                ? "text-sm text-emerald-200"
                : "text-sm text-red-200"
            }
          >
            {feedback.text}
          </p>
          <RelayOperationDiagnosticDetails diagnostic={feedback.diagnostic} />
        </div>
      ) : null}
    </div>
  );
}
