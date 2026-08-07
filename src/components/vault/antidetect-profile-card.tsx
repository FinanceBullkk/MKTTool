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
import { planProfileFingerprint } from "@/lib/antidetect/profile-fingerprint-plan";
import {
  describeRelayFailure,
  fetchRelayProfiles,
  sendTicketToRelay,
} from "@/lib/relay/relay-browser-client";
import type { RelayFingerprintOptions, RelayProfileSummary } from "@/lib/relay/relay-endpoints";

const BUTTON_CLASS =
  "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900";

type Feedback = { kind: "ok" | "error"; text: string } | null;

interface RelayState {
  profiles: RelayProfileSummary[];
  options: RelayFingerprintOptions;
}

export function AntidetectProfileCard({
  accountId,
  username,
  proxyCountry,
  proxyLabel,
}: {
  accountId: string;
  username: string;
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

      const sent = await sendTicketToRelay(issued.ticket);
      if (sent.status !== "ok" || !sent.data.ok) {
        setFeedback({
          kind: "error",
          text:
            sent.status === "ok"
              ? sent.data.message
              : describeRelayFailure(sent),
        });
        return;
      }

      const profileId = (sent.data as { profileId?: unknown }).profileId;
      if (typeof profileId !== "string" || profileId === "") {
        // Cầu nối báo thành công mà không kèm id: profile có thể đã sinh ra thật bên MultiZen,
        // nên nói rõ để người dùng đi dọn thay vì bấm lại và tạo thêm cái thứ hai.
        setFeedback({
          kind: "error",
          text:
            "Cầu nối báo đã tạo nhưng không trả về id profile, nên chưa ghi vào kho được. " +
            "Mở MultiZen kiểm xem có profile vừa sinh ra không.",
        });
        return;
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
  }, [accountId, plan]);

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
