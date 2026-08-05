/**
 * Ô nhập của nick, dùng chung cho form thêm mới và form sửa.
 *
 * Ba ô bí mật (mật khẩu nick, mật khẩu email, TOTP secret) chỉ bắt buộc lúc thêm mới; lúc
 * sửa thì để trống là giữ nguyên. Chúng không bao giờ được đổ ngược ra màn hình — xem
 * account-vault-actions-panel.tsx — nên form sửa không có cách nào hiện giá trị cũ.
 *
 * Ba ô đó là `VaultSecretField` chứ không phải `Field`: giá trị của chúng phải được cầu nối bọc
 * trước khi rời máy này, nên chúng bị khóa cho tới khi JavaScript sẵn sàng làm việc đó. Cả form
 * cũng phải là `AccountVaultForm`, không phải `ActionForm`.
 *
 * `platform` cố định sau khi tạo, cùng lý do với đích đăng: đổi nó là làm hỏng mọi job cũ.
 */
import { Field, SelectField } from "@/components/ui/form-controls";
import { ACCOUNT_STATUSES, getStatusPresentation } from "@/lib/accounts/account-status";
import { localDayKey } from "@/lib/format/vietnamese-date-format";
import { VaultSecretField } from "./vault-secret-field";

/**
 * Hai ô này bắt buộc với Reddit, bỏ trống được với Facebook — nhưng form không biết nền tảng
 * lúc đang gõ (ô nền tảng nằm ngay trên, và lúc sửa thì không có ô đó). Nên thay vì bật/tắt
 * `required` theo nền tảng, ô để mở và luật chấm ở server: bỏ trống cho nick Reddit thì thông
 * báo nói thẳng thiếu gì. Xem validatePlatformIdentityFields().
 */
const OPTIONAL_FOR_FACEBOOK_HINT =
  "Bắt buộc với nick Reddit. Nick Facebook bỏ trống được — Fanpage đăng bằng Graph API, không mở trình duyệt.";

export interface AccountDefaults {
  username: string;
  emailAddress: string;
  antidetectProfileId: string | null;
  personaId: string;
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

/** `<input type="date">` chỉ nhận đúng dạng YYYY-MM-DD, và phải là ngày theo giờ máy. */
function dateInputValue(date: Date | null | undefined): string | undefined {
  return date ? localDayKey(date) : undefined;
}

const STATUS_OPTIONS = ACCOUNT_STATUSES.map((status) => ({
  value: status,
  label: getStatusPresentation(status).label,
}));

export function AccountFormFields({
  personas,
  proxies,
  defaults,
}: {
  personas: SelectOption[];
  /** Lúc sửa phải gồm cả proxy đang gắn cho chính nick này, không chỉ proxy còn trống. */
  proxies: SelectOption[];
  defaults?: AccountDefaults;
}) {
  const editing = defaults !== undefined;

  return (
    <>
      {editing ? null : (
        <SelectField
          label="Nền tảng"
          name="platform"
          required
          options={[
            { value: "REDDIT", label: "Reddit" },
            { value: "FACEBOOK", label: "Facebook" },
          ]}
        />
      )}
      <Field label="Username" name="username" required defaultValue={defaults?.username} />
      <VaultSecretField
        label="Mật khẩu nick"
        name="password"
        type="password"
        required={!editing}
        hint={editing ? "Để trống là giữ nguyên" : undefined}
      />
      <Field
        label="Email gốc"
        name="emailAddress"
        type="email"
        required
        defaultValue={defaults?.emailAddress}
        hint="Không có email gốc thì đừng mua nick — người bán lấy lại được"
      />
      <VaultSecretField
        label="Mật khẩu email"
        name="emailPassword"
        type="password"
        required={!editing}
        hint={editing ? "Để trống là giữ nguyên" : undefined}
      />
      <VaultSecretField
        label="TOTP secret"
        name="totpSecret"
        hint={
          editing
            ? "Để trống là giữ nguyên. Gõ secret mới để thay. Cầu nối kiểm base32 trước khi bọc."
            : "Chuỗi base32 khi bật 2FA. Để trống nếu chưa bật."
        }
      />
      <Field
        label="Id profile antidetect"
        name="antidetectProfileId"
        defaultValue={defaults?.antidetectProfileId ?? undefined}
        hint={OPTIONAL_FOR_FACEBOOK_HINT}
      />
      <SelectField
        label="Nhân vật"
        name="personaId"
        required
        defaultValue={defaults?.personaId}
        options={personas.map((persona) => ({ value: persona.id, label: persona.label }))}
      />
      <SelectField
        label="Proxy"
        name="proxyId"
        defaultValue={defaults?.proxyId ?? undefined}
        hint={
          editing
            ? `${OPTIONAL_FOR_FACEBOOK_HINT} Chỉ hiện proxy còn trống và proxy đang gắn cho nick này.`
            : `${OPTIONAL_FOR_FACEBOOK_HINT} ${proxies.length} proxy chưa gắn nick.`
        }
        options={[
          { value: "", label: "— không gắn (chỉ nick Facebook) —" },
          ...proxies.map((proxy) => ({ value: proxy.id, label: proxy.label })),
        ]}
      />
      <SelectField
        label="Trạng thái"
        name="status"
        required
        defaultValue={defaults?.status ?? "COLD_START"}
        options={STATUS_OPTIONS}
      />
      <Field
        label="Karma"
        name="karma"
        type="number"
        defaultValue={defaults?.karma ?? 0}
        hint="Luật điều kiện đích chấm theo số này — cập nhật khi karma thật đổi"
      />
      <Field
        label="Cold-start tới ngày"
        name="coldStartUntil"
        type="date"
        defaultValue={dateInputValue(defaults?.coldStartUntil)}
        hint="Mua nick về thì đặt 14 ngày sau"
      />
      <Field
        label="Ngày tạo nick trên nền tảng"
        name="platformCreatedAt"
        type="date"
        defaultValue={dateInputValue(defaults?.platformCreatedAt)}
        hint="Dùng để kiểm tra điều kiện tuổi nick của subreddit"
      />
      <Field
        label="Ngày mua"
        name="purchasedAt"
        type="date"
        defaultValue={dateInputValue(defaults?.purchasedAt)}
      />
      <Field
        label="Ghi chú mua"
        name="purchaseNote"
        defaultValue={defaults?.purchaseNote ?? undefined}
        placeholder="Nguồn, giá, quốc gia gốc"
      />
      {editing ? (
        <Field
          label="Lý do cách ly"
          name="quarantineReason"
          defaultValue={defaults?.quarantineReason ?? undefined}
          placeholder="Vì sao nick bị treo — hiện ngay ở đầu trang chi tiết"
        />
      ) : null}
    </>
  );
}
