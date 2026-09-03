"use client";

/**
 * Gắn profile antidetect cho một nick — tạo mới, hoặc chọn từ profile có sẵn trên máy này.
 *
 * ## Ba trạng thái, và trạng thái thứ ba là trạng thái mặc định của hôm nay
 *
 * | Cầu nối trả lời | Thẻ hiện gì |
 * |---|---|
 * | Có danh sách (bản ≥6) | Nút **Tạo profile** kèm xem trước, và ô chọn nếu máy đã có profile |
 * | 404 (bản cũ) | Câu nhắc tải lại cầu nối, và **không** chặn gì — ô gõ tay ở thẻ "Sửa nick" vẫn dùng được |
 * | Không gọi được | Im lặng lùi về ô gõ tay: người này có thể đang nhập liệu hộ từ máy khác, và đó không phải lỗi |
 *
 * Nhánh cuối là lý do thẻ này **không bao giờ kêu đỏ**. Cầu nối không tự cập nhật (QĐ 11), nên
 * bản cũ còn chạy ngoài kia rất lâu — một dải đỏ ở đây sẽ là dải đỏ thường trực, và dải đỏ
 * thường trực thì không ai đọc nữa.
 *
 * ## Lượt tạo có thể XONG mà trình duyệt không biết
 *
 * The Relay creates the profile in MKT Browser **before** responding, and creation can normally
 * take a full minute. Anything that interrupts those operations, including a timeout, a closed tab,
 * or a brief local-network outage, leaves behind a **real profile that the vault does not know about**.
 *
 * Hai lớp chống, và lớp thứ hai mới là lớp thật:
 *
 * 1. `RELAY_CREATE_PROFILE_TIMEOUT_MS` — hạn giờ riêng 60 giây thay cho 4 giây mặc định.
 * 2. **Dò lại `/profiles` theo tên** khi không có id trong tay (`doProfileVuaTao`). Nới hạn giờ chỉ
 *    làm ca hỏng hiếm đi; đường dò mới là thứ nhặt lại được profile đã lỡ sinh ra.
 *
 * Đã vấp thật 07/08/2026, ngay lượt tạo đầu tiên trên máy thật.
 *
 * ## Vì sao phép chọn cấu hình profile chạy ở TRÌNH DUYỆT
 *
 * The locale catalog lives in MKT Browser on this machine; the server cannot read it. Therefore
 * `planProfileFingerprint` runs here, shows the operator a preview of the profile configuration
 * **before** they click, and sends the result to the server with the ticket request. See the opening comment in
 * `account-profile-actions.ts` for why the server does not validate it again.
 */
import { useCallback, useEffect, useState } from "react";
import {
  recordCreatedProfile,
  requestCreateProfileTicket,
} from "@/lib/accounts/account-profile-actions";
import {
  planProfileFingerprint,
  profileNameForNick,
} from "@/lib/antidetect/profile-fingerprint-plan";
import {
  describeRelayFailure,
  describeSlowRelayFailure,
  fetchRelayProfiles,
  sendTicketToRelay,
  type RelayOutcome,
} from "@/lib/relay/relay-browser-client";
import {
  RELAY_PROFILE_WORK_TIMEOUT_MS,
  type RelayFingerprintOptions,
  type RelayProfileSummary,
  type RelayReply,
  type RelayOperationDiagnostic,
} from "@/lib/relay/relay-endpoints";
import { RelayOperationDiagnosticDetails } from "@/components/relay/relay-operation-diagnostic-details";

const BUTTON_CLASS =
  "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900";

type Feedback = {
  kind: "ok" | "error";
  text: string;
  diagnostic?: RelayOperationDiagnostic;
} | null;

/** Cầu nối trả lời được nhưng không kèm id thì chính câu của nó là câu đáng hiện. */
function moTaNguyenNhan(sent: RelayOutcome<RelayReply>): string {
  return sent.status === "ok"
    ? sent.data.message
    : describeSlowRelayFailure(sent, "create browser profile");
}

interface RelayState {
  profiles: RelayProfileSummary[];
  options: RelayFingerprintOptions;
}

export function AntidetectProfileCard({
  accountId,
  username,
  platform,
  proxyCountry,
  proxyLabel,
}: {
  accountId: string;
  username: string;
  /**
   * Nền tảng của nick — chỉ dùng để **dựng lại đúng tên profile** mà máy chủ đã đặt vào vé.
   *
   * Hai bên phải ra cùng một chuỗi thì đường dò lại mới tìm thấy gì; cả hai đều gọi
   * `profileNameForNick`, không bên nào tự ghép chuỗi.
   */
  platform: string;
  /** `Proxy.country` của nick. `null` khi chưa gắn proxy — lúc đó chưa dựng cấu hình profile được. */
  proxyCountry: string | null;
  proxyLabel: string | null;
}) {
  const [relay, setRelay] = useState<RelayState | null>(null);
  const [relayOld, setRelayOld] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let huy = false;

    void fetchRelayProfiles().then((outcome) => {
      if (huy) return;
      if (outcome.status === "ok") {
        setRelay({
          profiles: outcome.data.profiles ?? [],
          options: outcome.data.fingerprintOptions ?? { devices: [], locales: [] },
        });
        return;
      }
      // Bị từ chối = cầu nối trả lời nhưng không hiểu đường này, tức bản cũ. Không gọi được thì
      // im lặng: rất có thể người dùng đang ngồi máy khác, và đó là chuyện bình thường.
      if (outcome.status === "rejected") setRelayOld(true);
    });

    return () => {
      huy = true;
    };
  }, []);

  const plan =
    relay && proxyCountry
      ? planProfileFingerprint({ proxyCountry, seedKey: username, options: relay.options })
      : null;

  /**
   * Dò lại danh sách profile để tìm cái vừa sinh ra, khi lượt gửi vé không trả về id.
   *
   * ## Vì sao cần đường này chứ không chỉ cần một hạn giờ dài hơn
   *
   * The Relay asks MKT Browser to create the profile **before** responding. Anything that interrupts
   * those operations, including a timeout, a closed tab, or a brief local-network outage, leaves
   * behind a **real profile that the vault does not know about**. A longer timeout makes this less
   * likely, but cannot eliminate it.
   *
   * Dò được là nhờ tên profile **sinh ra có quy tắc** (`profileNameForNick`), nên nó là khóa tra
   * cứu chứ không phải nhãn cho đẹp.
   *
   * ## Vì sao trùng tên thì TỪ CHỐI đoán
   *
   * Two profiles with the same name indicate an earlier failed creation attempt. Choosing one
   * arbitrarily could store an ID that does not belong to the profile just created, while the other
   * becomes permanent orphaned data that nobody knows to remove. The operator can resolve the
   * ambiguity by opening MKT Browser and removing the duplicate.
   */
  const doProfileVuaTao = useCallback(
    async (tenMongDoi: string): Promise<{ ok: true; id: string } | { ok: false; text: string }> => {
      const outcome = await fetchRelayProfiles();
      if (outcome.status !== "ok") {
        return {
          ok: false,
          text: `Could not refresh the browser profile list. ${describeRelayFailure(outcome)}`,
        };
      }

      const trung = (outcome.data.profiles ?? []).filter((p) => p.name === tenMongDoi);
      if (trung.length === 1) return { ok: true, id: trung[0].id };

      return {
        ok: false,
        text:
          trung.length === 0
            ? `No browser profile named "${tenMongDoi}" was found on this Relay PC, so the ` +
              `creation probably did not finish. Try again.`
            : `Found ${trung.length} browser profiles named "${tenMongDoi}", which indicates ` +
              `an earlier creation attempt failed. The tool cannot guess which one is correct. ` +
              `Open MKT Browser, remove the duplicates, then paste the remaining ID into the ` +
              `"Browser profile ID" field in the nick edit form.`,
      };
    },
    [],
  );

  const taoProfile = useCallback(async () => {
    if (!plan?.ok) return;

    setBusy(true);
    setFeedback(null);
    try {
      const issued = await requestCreateProfileTicket(accountId, plan.plan);
      if ("ok" in issued) {
        setFeedback({ kind: "error", text: issued.message });
        return;
      }

      // Hạn giờ riêng: lượt này dựng cả một hồ sơ Chromium trên đĩa, không phải một lượt hỏi đáp.
      const sent = await sendTicketToRelay(issued.ticket, RELAY_PROFILE_WORK_TIMEOUT_MS);

      const traVe = sent.status === "ok" && sent.data.ok ? sent.data : null;
      const idTraVe = (traVe as { profileId?: unknown } | null)?.profileId;

      let profileId: string;
      if (typeof idTraVe === "string" && idTraVe !== "") {
        profileId = idTraVe;
      } else {
        // Không có id trong tay — nhưng profile RẤT CÓ THỂ đã sinh ra thật. Đi dò trước khi kết
        // luận, thay vì đẩy người dùng đi bấm lại và tạo thêm một cái thứ hai.
        const do_ = await doProfileVuaTao(profileNameForNick(platform, username));
        if (!do_.ok) {
          setFeedback({ kind: "error", text: `${moTaNguyenNhan(sent)} ${do_.text}` });
          return;
        }
        profileId = do_.id;
      }

      const recorded = await recordCreatedProfile({
        accountId,
        profileId,
        deviceId: issued.deviceId,
      });
      setFeedback({
        kind: recorded.ok ? "ok" : "error",
        text: recorded.message,
        diagnostic:
          sent.status === "ok" || sent.status === "rejected"
            ? sent.data?.diagnostic
            : undefined,
      });
    } catch {
      setFeedback({
        kind: "error",
        text: "The server could not be reached. Reload the page and try again.",
      });
    } finally {
      setBusy(false);
    }
  }, [accountId, doProfileVuaTao, plan, platform, username]);

  // Không gọi được cầu nối: không vẽ gì. Ô gõ tay ở thẻ "Sửa nick" vẫn là đường dùng được.
  if (!relay && !relayOld) return null;

  if (relayOld) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Relay on this PC is outdated and cannot create a browser profile here. Download the current
        version from{" "}
        <a href="/setup#download" className="underline">
          /setup
        </a>{" "}
        or paste the browser profile ID into the nick edit form.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {proxyCountry === null ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          This nick has no proxy, so its browser profile configuration cannot be created. Assign a
          proxy in the nick edit form first; locale and timezone follow the proxy country.
        </p>
      ) : plan?.ok ? (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            This will create a browser profile with proxy <strong>{proxyLabel}</strong> and
            locale/timezone settings <strong>{plan.plan.localeId}</strong> /{" "}
            <strong>{plan.plan.timezone}</strong> / <strong>{plan.plan.device}</strong>, matched to
            the proxy country. This is a browser profile configuration convenience, not proof of
            identity isolation, so you do not need to use &quot;Match proxy&quot; in MKT Browser.
          </p>
          <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={taoProfile}>
            {busy ? "Creating..." : "Create browser profile on this Relay PC"}
          </button>
          <p className="text-xs text-neutral-500">
            After creation, the nick is assigned to this Relay PC. Browser profile data stays local,
            and Relay allows only the assigned PC to open it. This does not prove identity isolation.
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-400">{plan?.failure.message}</p>
      )}

      {relay && relay.profiles.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">
            Or use a browser profile already on this Relay PC ({relay.profiles.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {relay.profiles.map((profile) => (
              <li key={profile.id} className="font-mono text-xs">
                <span className="font-sans">{profile.name}</span> — {profile.id}
                {profile.proxyCountry && profile.timezone ? (
                  <span className="font-sans text-neutral-500">
                    {" "}
                    ({profile.proxyCountry.toUpperCase()} / {profile.timezone})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Paste the ID into &quot;Browser profile ID&quot; in the nick edit form. Check the proxy country
            against the timezone; a mismatch means the browser profile is not aligned with that
            proxy.
          </p>
        </details>
      ) : null}

      {feedback ? (
        <div className="space-y-2">
          <p
            className={
              feedback.kind === "ok"
                ? "text-sm text-emerald-700 dark:text-emerald-400"
                : "text-sm text-red-700 dark:text-red-400"
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
