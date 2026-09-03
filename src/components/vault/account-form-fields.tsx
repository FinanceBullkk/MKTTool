"use client";

/**
 * Ô nhập của nick, dùng chung cho form thêm mới và form sửa.
 *
 * ## Vì sao file này là client component
 *
 * Form phải vẽ lại theo **nền tảng đang chọn**: nick Reddit đăng nhập bằng tài khoản Google nên
 * không có mật khẩu riêng, và ba ô còn lại đổi tên gọi cho đúng thứ chúng đang giữ. Bản trước ghi
 * *"form không biết nền tảng lúc đang gõ"* nên để mọi ô mở và đẩy hết luật xuống server — nhưng
 * "không biết" chỉ đúng khi không ai chịu giữ state, còn ô nền tảng thì nằm ngay trên cùng.
 *
 * Luật vẫn chấm ở server (`validatePlatformAccountFields`). Ẩn/hiện ở đây là để **đừng hỏi** thứ
 * không tồn tại, không phải để canh cửa.
 *
 * ## Ba ô bí mật
 *
 * Chỉ bắt buộc lúc thêm mới; lúc sửa thì để trống là giữ nguyên. Chúng không bao giờ được đổ
 * ngược ra màn hình — xem account-vault-actions-panel.tsx — nên form sửa không có cách nào hiện
 * giá trị cũ. Chúng là `VaultSecretField` chứ không phải `Field`: giá trị phải được cầu nối bọc
 * trước khi rời máy này, nên chúng bị khóa cho tới khi JavaScript sẵn sàng làm việc đó. Cả form
 * cũng phải là `AccountVaultForm`, không phải `ActionForm`.
 *
 * `platform` cố định sau khi tạo, cùng lý do với đích đăng: đổi nó là làm hỏng mọi job cũ.
 */
import { useState } from "react";
import { Field, SelectField } from "@/components/ui/form-controls";
import { ACCOUNT_STATUSES, getStatusPresentation } from "@/lib/accounts/account-status";
import { localDayKey } from "@/lib/format/vietnamese-date-format";
import { VaultSecretField } from "./vault-secret-field";

const PROXY_HINT_TAIL =
  "Required for Reddit nicks. Facebook nicks can leave it blank because Facebook Pages use the Graph API without opening a browser.";

/**
 * Ô mã 2 lớp trước đây chỉ nói *"chuỗi base32 khi bật 2FA"* — đúng nhưng vô dụng với người chưa
 * từng nghe tới nó, và kết quả là kho **không có lấy một nick nào lưu mã này** (đo 07/08/2026).
 * Gợi ý phải trả lời được *lấy nó ở đâu*, không chỉ *nó bắt buộc hay không*.
 */
const TOTP_HINT_REDDIT =
  'In the Google Account, turn on "2-Step Verification", select "Authenticator app", then copy ' +
  "the letter-and-number key shown beside the QR code. Save it here to request OTPs on this Relay " +
  "PC without using the phone. Leave it blank if 2-Step Verification is not enabled.";

export interface AccountDefaults {
  username: string;
  emailAddress: string;
  antidetectProfileId: string | null;
  voice: string | null;
  contentAngle: string | null;
  proxyId: string | null;
  status: string;
  karma: number;
  quarantineReason: string | null;
  coldStartUntil: Date | null;
  platformCreatedAt: Date | null;
  purchasedAt: Date | null;
  purchaseNote: string | null;
}

export interface SelectOption {
  id: string;
  label: string;
}

/** Người đang mở form — quyết định ô "Người phụ trách" là ô chọn hay chỉ đọc. */
export interface FormViewer {
  userId: string;
  email: string;
  isAdmin: boolean;
}

/** `<input type="date">` chỉ nhận đúng dạng YYYY-MM-DD, và phải là ngày theo giờ máy. */
function dateInputValue(date: Date | null | undefined): string | undefined {
  return date ? localDayKey(date) : undefined;
}

const STATUS_OPTIONS = ACCOUNT_STATUSES.map((status) => ({
  value: status,
  label: getStatusPresentation(status).label,
}));

export function AccountFormFields({
  proxies,
  defaults,
  defaultColdStartUntil,
  platform,
  viewer,
  teamMembers,
  proxyEditAccess,
}: {
  /** Lúc sửa phải gồm cả proxy đang gắn cho chính nick này, không chỉ proxy còn trống. */
  proxies: SelectOption[];
  defaults?: AccountDefaults;
  /**
   * Ngày cold-start điền sẵn cho form **tạo mới**, dạng `YYYY-MM-DD`.
   *
   * Tính ở server rồi truyền xuống chứ không tính tại chỗ: component này nằm trong cây client,
   * nên `new Date()` ở đây cho ra hai giá trị khác nhau giữa lượt render server và lượt hydrate
   * — React sẽ kêu, và tệ hơn là nó im lặng lấy giá trị của máy người dùng thay vì giờ team.
   */
  defaultColdStartUntil?: string;
  /** Nền tảng của bản ghi đang sửa. Form tạo không truyền — người dùng tự chọn. */
  platform?: string;
  /** Chỉ form **tạo** truyền hai ô dưới đây; form sửa đổi chủ ở thẻ Phân công cụm. */
  viewer?: FormViewer;
  teamMembers?: { id: string; email: string }[];
  proxyEditAccess?: { isAdmin: boolean; adminContactEmail: string };
}) {
  const editing = defaults !== undefined;
  const proxyIsReadOnly = editing && proxyEditAccess?.isAdmin === false;
  const currentProxyLabel = defaults?.proxyId
    ? (proxies.find((proxy) => proxy.id === defaults.proxyId)?.label ?? defaults.proxyId)
    : "No proxy assigned (Facebook only)";

  // Nick Reddit là chuyện thường ngày của công cụ này, nên nó là mặc định — đỡ một cú bấm ở mọi
  // lượt nhập. Người thêm nick Facebook thấy ngay là form đổi hình dạng khi chọn.
  const [chosenPlatform, setChosenPlatform] = useState(platform ?? "REDDIT");
  const reddit = chosenPlatform === "REDDIT";

  return (
    <>
      {editing ? null : (
        <SelectField
          label="Platform"
          name="platform"
          required
          defaultValue="REDDIT"
          onChange={setChosenPlatform}
          options={[
            { value: "REDDIT", label: "Reddit" },
            { value: "FACEBOOK", label: "Facebook" },
          ]}
        />
      )}
      <Field label="Username" name="username" required defaultValue={defaults?.username} />

      {/* Nick Reddit KHÔNG có mật khẩu riêng — nó đăng nhập bằng nút "Continue with Google". Ô này
          từng bắt buộc cho mọi nền tảng, nên người nhập phải bịa một chuỗi, và chuỗi giả đó nằm
          lại trong kho phải được canh giữ y như bí mật thật. Xem `validatePlatformAccountFields`. */}
      {reddit ? null : (
        <VaultSecretField
          label="Nick password"
          name="password"
          type="password"
          required={!editing}
          hint={editing ? "Leave blank to keep the current password" : undefined}
        />
      )}

      <Field
        label={reddit ? "Google email" : "Original email"}
        name="emailAddress"
        type="email"
        required
        defaultValue={defaults?.emailAddress}
        hint={
          reddit
            ? "This Google Account signs in to Reddit. Do not buy the nick without it because the seller could recover the nick."
            : "Do not buy the nick without its original email because the seller could recover the nick."
        }
      />
      <VaultSecretField
        label={reddit ? "Google password" : "Email password"}
        name="emailPassword"
        type="password"
        required={!editing}
        hint={
          editing
            ? "Leave blank to keep the current password"
            : reddit
              ? "This password opens the Google Account used to sign in to the Reddit nick"
              : undefined
        }
      />
      <VaultSecretField
        label={reddit ? "Google 2FA secret" : "TOTP secret"}
        name="totpSecret"
        hint={
          editing
            ? "Leave blank to keep the current secret. Enter a new secret to replace it; Relay validates base32 before encrypting it."
            : reddit
              ? TOTP_HINT_REDDIT
              : "Enter the base32 secret from 2FA setup, or leave it blank if 2FA is not enabled."
        }
      />

      {/* Chỉ còn ở form SỬA, và chỉ còn là đường lùi. Đường chính là nút "Tạo profile trên máy
          này" ở trang chi tiết — bắt điền id lúc tạo là dựng một vòng luẩn quẩn, vì id chỉ có
          được sau khi nick đã tồn tại. */}
      {editing ? (
        <Field
          label="Browser profile ID"
          name="antidetectProfileId"
          defaultValue={defaults?.antidetectProfileId ?? undefined}
          hint="Usually filled automatically when the browser profile is created. Enter it manually when MKT Browser created the profile on another Relay PC."
        />
      ) : null}

      {/* Hai ô ghi chú cho NGƯỜI SẮP NGỒI XUỐNG VIẾT, không phải đầu vào của bộ luật. Luật 7 so
          trùng văn bản thật lúc bấm đăng; hai ô này đứng ở đầu kia của việc — nhắc làn viết trước
          khi viết, để đỡ phải viết lại. Không bắt buộc: thiếu thì cột "Sẵn sàng" nhắc (NO_VOICE). */}
      <Field
        label="Writing voice"
        name="voice"
        defaultValue={defaults?.voice ?? undefined}
        hint="Describe how this nick writes, for example: calm, evidence-led, and sparing with emoji."
      />
      <Field
        label="Content focus"
        name="contentAngle"
        defaultValue={defaults?.contentAngle ?? undefined}
        hint="Describe what this nick writes about, for example: self-hosting or affordable older hardware."
      />

      {proxyIsReadOnly ? (
        <>
          <input type="hidden" name="proxyId" value={defaults?.proxyId ?? ""} />
          <Field
            label="Proxy"
            name="proxyIdDisplay"
            defaultValue={currentProxyLabel}
            disabled
            hint={`Changing a nick's proxy is an ADMIN task. Contact ${proxyEditAccess.adminContactEmail} to request the change.`}
          />
        </>
      ) : (
        <SelectField
          label="Proxy"
          name="proxyId"
          defaultValue={defaults?.proxyId ?? undefined}
          hint={
            editing
              ? `${PROXY_HINT_TAIL} Only unassigned proxies and this nick's current proxy are shown.`
              : `${PROXY_HINT_TAIL} ${proxies.length} unassigned proxies available.`
          }
          options={[
            { value: "", label: "No proxy assigned (Facebook only)" },
            ...proxies.map((proxy) => ({ value: proxy.id, label: proxy.label })),
          ]}
        />
      )}

      {/* Chỉ ở form TẠO. Đổi chủ về sau là việc của thẻ Phân công cụm, chỗ duy nhất biết đối
          chiếu chủ với máy giữ profile. Ô này tồn tại vì nick sinh ra vô chủ thì chính người vừa
          khai nó cũng không bấm được nút Tạo profile — `requireNickOwner` chặn. */}
      {!editing && viewer ? (
        viewer.isAdmin ? (
          <SelectField
            label="Nick owner"
            name="ownerId"
            defaultValue={viewer.userId}
            hint="Only teammates who have signed in at least once appear. This person creates the browser profile on their Relay PC."
            options={(teamMembers ?? []).map((member) => ({
              value: member.id,
              label: member.email,
            }))}
          />
        ) : (
          <Field
            label="Nick owner"
            name="ownerIdDisplay"
            defaultValue={viewer.email}
            disabled
            hint="A nick you add belongs to you. An administrator can transfer it in the Nick assignment card."
          />
        )
      ) : null}

      {/* Ô vận hành, chỉ có nghĩa cho nick đã sống một thời gian — nick mới luôn là COLD_START,
          và schema tạo đã mặc định đúng giá trị đó. Xem `accountCreateBase`. */}
      {editing ? (
        <SelectField
          label="Status"
          name="status"
          required
          defaultValue={defaults?.status}
          options={STATUS_OPTIONS}
        />
      ) : null}
      <Field
        label="Karma"
        name="karma"
        type="number"
        defaultValue={defaults?.karma ?? 0}
        hint="Posting target rules use this value, so update it when the nick's real karma changes"
      />
      <Field
        label="Cold-start until"
        name="coldStartUntil"
        type="date"
        // Mốc 14 ngày là quy ước cố định của dự án, lặp lại ở mọi nick — điền sẵn thay vì bắt
        // mỗi người tự cộng. Sửa được, và để trống được nếu nick đã qua cold-start từ lâu.
        defaultValue={dateInputValue(defaults?.coldStartUntil) ?? defaultColdStartUntil}
        hint={
          editing
            ? "Until this date, the nick may read but must not post"
            : "Defaults to 14 days from today, the standard period for a newly purchased nick"
        }
      />
      <Field
        label="Platform creation date"
        name="platformCreatedAt"
        type="date"
        defaultValue={dateInputValue(defaults?.platformCreatedAt)}
        hint="Used to check subreddit requirements for nick age"
      />
      <Field
        label="Purchase date"
        name="purchasedAt"
        type="date"
        defaultValue={dateInputValue(defaults?.purchasedAt)}
      />
      <Field
        label="Purchase notes"
        name="purchaseNote"
        defaultValue={defaults?.purchaseNote ?? undefined}
        placeholder="Source, price, original country"
      />
      {editing ? (
        <Field
          label="Quarantine reason"
          name="quarantineReason"
          defaultValue={defaults?.quarantineReason ?? undefined}
          placeholder="Why the nick was quarantined; shown at the top of its details page"
        />
      ) : null}
    </>
  );
}
