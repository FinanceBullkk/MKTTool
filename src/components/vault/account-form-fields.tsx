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
  "Bắt buộc với nick Reddit. Nick Facebook bỏ trống được — Fanpage đăng bằng Graph API, không mở trình duyệt.";

/**
 * Ô mã 2 lớp trước đây chỉ nói *"chuỗi base32 khi bật 2FA"* — đúng nhưng vô dụng với người chưa
 * từng nghe tới nó, và kết quả là kho **không có lấy một nick nào lưu mã này** (đo 07/08/2026).
 * Gợi ý phải trả lời được *lấy nó ở đâu*, không chỉ *nó bắt buộc hay không*.
 */
const TOTP_HINT_REDDIT =
  'Bật "Xác minh 2 bước" cho tài khoản Google → chọn Ứng dụng xác thực → chuỗi chữ+số hiện cạnh ' +
  "mã QR. Có nó thì bấm Lấy OTP ngay trên máy, khỏi mò điện thoại. Chưa bật 2 lớp thì để trống.";

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
}) {
  const editing = defaults !== undefined;

  // Nick Reddit là chuyện thường ngày của công cụ này, nên nó là mặc định — đỡ một cú bấm ở mọi
  // lượt nhập. Người thêm nick Facebook thấy ngay là form đổi hình dạng khi chọn.
  const [chosenPlatform, setChosenPlatform] = useState(platform ?? "REDDIT");
  const reddit = chosenPlatform === "REDDIT";

  return (
    <>
      {editing ? null : (
        <SelectField
          label="Nền tảng"
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
          label="Mật khẩu nick"
          name="password"
          type="password"
          required={!editing}
          hint={editing ? "Để trống là giữ nguyên" : undefined}
        />
      )}

      <Field
        label={reddit ? "Email Google" : "Email gốc"}
        name="emailAddress"
        type="email"
        required
        defaultValue={defaults?.emailAddress}
        hint={
          reddit
            ? "Tài khoản Google dùng để đăng nhập Reddit. Không có nó thì đừng mua nick — người bán lấy lại được"
            : "Không có email gốc thì đừng mua nick — người bán lấy lại được"
        }
      />
      <VaultSecretField
        label={reddit ? "Mật khẩu Google" : "Mật khẩu email"}
        name="emailPassword"
        type="password"
        required={!editing}
        hint={
          editing
            ? "Để trống là giữ nguyên"
            : reddit
              ? "Đây mới là thứ mở được nick Reddit"
              : undefined
        }
      />
      <VaultSecretField
        label={reddit ? "Mã 2 lớp của Google" : "TOTP secret"}
        name="totpSecret"
        hint={
          editing
            ? "Để trống là giữ nguyên. Gõ secret mới để thay. Cầu nối kiểm base32 trước khi bọc."
            : reddit
              ? TOTP_HINT_REDDIT
              : "Chuỗi base32 khi bật 2FA. Để trống nếu chưa bật."
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
        label="Giọng viết"
        name="voice"
        defaultValue={defaults?.voice ?? undefined}
        hint="Nick này nói kiểu gì. Ví dụ: điềm đạm, hay dẫn số liệu, ít dùng emoji."
      />
      <Field
        label="Mảng nội dung"
        name="contentAngle"
        defaultValue={defaults?.contentAngle ?? undefined}
        hint="Nick này viết về cái gì. Ví dụ: self-hosting, phần cứng cũ giá rẻ."
      />

      <SelectField
        label="Proxy"
        name="proxyId"
        defaultValue={defaults?.proxyId ?? undefined}
        hint={
          editing
            ? `${PROXY_HINT_TAIL} Chỉ hiện proxy còn trống và proxy đang gắn cho nick này.`
            : `${PROXY_HINT_TAIL} ${proxies.length} proxy chưa gắn nick.`
        }
        options={[
          { value: "", label: "— không gắn (chỉ nick Facebook) —" },
          ...proxies.map((proxy) => ({ value: proxy.id, label: proxy.label })),
        ]}
      />

      {/* Chỉ ở form TẠO. Đổi chủ về sau là việc của thẻ Phân công cụm, chỗ duy nhất biết đối
          chiếu chủ với máy giữ profile. Ô này tồn tại vì nick sinh ra vô chủ thì chính người vừa
          khai nó cũng không bấm được nút Tạo profile — `requireNickOwner` chặn. */}
      {!editing && viewer ? (
        viewer.isAdmin ? (
          <SelectField
            label="Người phụ trách"
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
            label="Người phụ trách"
            name="ownerIdDisplay"
            defaultValue={viewer.email}
            disabled
            hint="Nick bạn thêm là nick của bạn. Quản trị viên chuyển sang người khác được ở thẻ Phân công cụm."
          />
        )
      ) : null}

      {/* Ô vận hành, chỉ có nghĩa cho nick đã sống một thời gian — nick mới luôn là COLD_START,
          và schema tạo đã mặc định đúng giá trị đó. Xem `accountCreateBase`. */}
      {editing ? (
        <SelectField
          label="Trạng thái"
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
        hint="Luật điều kiện đích chấm theo số này — cập nhật khi karma thật đổi"
      />
      <Field
        label="Cold-start tới ngày"
        name="coldStartUntil"
        type="date"
        // Mốc 14 ngày là quy ước cố định của dự án, lặp lại ở mọi nick — điền sẵn thay vì bắt
        // mỗi người tự cộng. Sửa được, và để trống được nếu nick đã qua cold-start từ lâu.
        defaultValue={dateInputValue(defaults?.coldStartUntil) ?? defaultColdStartUntil}
        hint={
          editing
            ? "Trước mốc này nick chỉ được đọc, cấm đăng"
            : "Điền sẵn 14 ngày kể từ hôm nay — mốc chuẩn cho nick vừa mua"
        }
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
