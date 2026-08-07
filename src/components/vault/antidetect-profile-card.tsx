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
 * Cầu nối dựng profile bên MultiZen **rồi mới** trả lời, và lượt dựng đó chạy cả phút một cách
 * bình thường. Bất cứ thứ gì cắt ngang giữa hai việc — hết hạn giờ, đóng tab, mạng nội bộ chớp —
 * đều để lại một profile **có thật mà kho không biết**.
 *
 * Hai lớp chống, và lớp thứ hai mới là lớp thật:
 *
 * 1. `RELAY_CREATE_PROFILE_TIMEOUT_MS` — hạn giờ riêng 60 giây thay cho 4 giây mặc định.
 * 2. **Dò lại `/profiles` theo tên** khi không có id trong tay (`doProfileVuaTao`). Nới hạn giờ chỉ
 *    làm ca hỏng hiếm đi; đường dò mới là thứ nhặt lại được profile đã lỡ sinh ra.
 *
 * Đã vấp thật 07/08/2026, ngay lượt tạo đầu tiên trên máy thật.
 *
 * ## Vì sao phép chọn vân tay chạy ở TRÌNH DUYỆT
 *
 * Danh mục locale nằm trong MultiZen trên máy này; máy chủ không đọc được. Nên `planProfileFingerprint`
 * chạy ngay đây, hiện xem trước cho người dùng thấy **trước khi** bấm, rồi gửi kết quả lên cùng
 * lời xin vé. Xem chú thích đầu `account-profile-actions.ts` về chuyện máy chủ không đối chiếu lại.
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
} from "@/lib/relay/relay-endpoints";

const BUTTON_CLASS =
  "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900";

type Feedback = { kind: "ok" | "error"; text: string } | null;

/** Cầu nối trả lời được nhưng không kèm id thì chính câu của nó là câu đáng hiện. */
function moTaNguyenNhan(sent: RelayOutcome<RelayReply>): string {
  return sent.status === "ok" ? sent.data.message : describeSlowRelayFailure(sent, "dựng profile");
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
  /** `Proxy.country` của nick. `null` khi chưa gắn proxy — lúc đó chưa dựng vân tay được. */
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
   * Cầu nối gọi MultiZen dựng profile **rồi mới** trả lời. Bất cứ thứ gì cắt ngang giữa hai việc
   * đó — hết hạn giờ, đóng tab, mạng nội bộ chớp — đều để lại một profile **đã tồn tại thật mà kho
   * không biết**. Nới hạn giờ làm ca đó hiếm đi, không làm nó biến mất.
   *
   * Dò được là nhờ tên profile **sinh ra có quy tắc** (`profileNameForNick`), nên nó là khóa tra
   * cứu chứ không phải nhãn cho đẹp.
   *
   * ## Vì sao trùng tên thì TỪ CHỐI đoán
   *
   * Hai profile cùng tên nghĩa là đã có một lượt tạo hỏng trước đó. Chọn bừa một cái là ghi vào kho
   * một id có thể không phải cái vừa dựng — và cái còn lại thành rác vĩnh viễn mà không ai biết để
   * đi dọn. Nói thẳng ra thì người dùng mở MultiZen xóa bớt trong mười giây.
   */
  const doProfileVuaTao = useCallback(
    async (tenMongDoi: string): Promise<{ ok: true; id: string } | { ok: false; text: string }> => {
      const outcome = await fetchRelayProfiles();
      if (outcome.status !== "ok") {
        return {
          ok: false,
          text: `Không hỏi lại được danh sách profile để kiểm. ${describeRelayFailure(outcome)}`,
        };
      }

      const trung = (outcome.data.profiles ?? []).filter((p) => p.name === tenMongDoi);
      if (trung.length === 1) return { ok: true, id: trung[0].id };

      return {
        ok: false,
        text:
          trung.length === 0
            ? `Không thấy profile nào tên "${tenMongDoi}" trên máy này, nên nhiều khả năng lượt ` +
              `tạo chưa chạy tới nơi. Bấm lại.`
            : `Có ${trung.length} profile trùng tên "${tenMongDoi}" bên MultiZen — dấu hiệu của ` +
              `một lượt tạo hỏng trước đó. Công cụ không đoán cái nào là cái đúng: mở MultiZen xóa ` +
              `bớt, rồi dán id còn lại vào ô "Id profile antidetect" ở thẻ Sửa nick.`,
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
      setFeedback({ kind: recorded.ok ? "ok" : "error", text: recorded.message });
    } catch {
      setFeedback({ kind: "error", text: "Không gọi được máy chủ. Tải lại trang rồi thử lại." });
    } finally {
      setBusy(false);
    }
  }, [accountId, doProfileVuaTao, plan, platform, username]);

  // Không gọi được cầu nối: không vẽ gì. Ô gõ tay ở thẻ "Sửa nick" vẫn là đường dùng được.
  if (!relay && !relayOld) return null;

  if (relayOld) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Cầu nối trên máy này là bản cũ nên chưa tạo được profile từ đây. Tải bản mới ở{" "}
        <a href="/relay-download" className="underline">
          /relay-download
        </a>{" "}
        — trong lúc chờ, vẫn dán id profile vào thẻ &quot;Sửa nick&quot; như trước.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {proxyCountry === null ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Nick chưa gắn proxy nên chưa dựng được vân tay — công cụ căn locale và múi giờ theo quốc
          gia của proxy. Gắn proxy ở thẻ &quot;Sửa nick&quot; trước.
        </p>
      ) : plan?.ok ? (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Sẽ dựng một profile mang sẵn proxy <strong>{proxyLabel}</strong> cùng vân tay{" "}
            <strong>{plan.plan.localeId}</strong> / <strong>{plan.plan.timezone}</strong> /{" "}
            <strong>{plan.plan.device}</strong> — khớp quốc gia proxy, nên không phải bấm
            &quot;Match proxy&quot; trong MultiZen nữa.
          </p>
          <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={taoProfile}>
            {busy ? "Đang tạo…" : "Tạo profile trên máy này"}
          </button>
          <p className="text-xs text-neutral-500">
            Tạo xong, nick được ghim luôn vào máy này — profile chỉ tồn tại ở đây nên nó cũng là
            máy duy nhất mở được nick.
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-400">{plan?.failure.message}</p>
      )}

      {relay && relay.profiles.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">
            Hoặc dùng một profile đã có trên máy này ({relay.profiles.length})
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
            Chép id vào ô &quot;Id profile antidetect&quot; ở thẻ Sửa nick. Nhớ đối chiếu quốc gia
            proxy với múi giờ — lệch nhau nghĩa là profile đó chưa căn theo proxy.
          </p>
        </details>
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
