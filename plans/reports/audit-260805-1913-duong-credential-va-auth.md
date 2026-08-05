# Audit — đường credential + auth

**Ngày:** 05/08/2026 | **Branch:** `feat/gd03-tach-hai-vung-khoa`

Đợt 2, nối tiếp [audit GĐ3](audit-260805-1904-gd03-tach-hai-vung-khoa.md). Phạm vi: **mọi chỗ bí
mật đi qua** — không phải toàn bộ tool.

**Đã đọc:** `lib/auth/` đầy đủ (`require-actor`, `allowed-emails`, `auth-server`, `guarded-action`,
`guarded-route`) · `lib/http/same-origin-guard` · cả 6 route handler trong `app/api/` ·
`vault-create-actions` / `vault-update-actions` / `vault-credential-actions` ·
`account-owner-actions` · `vault-form-schemas` (phần schema nick).

**Chưa đọc:** `lib/rules/`, `lib/health/`, `lib/facebook/` (trừ luồng OAuth), `lib/queue/`,
`lib/antidetect/`, `lib/proxies/`, `lib/totp/`, mọi trang trong `app/` trừ `/relay-devices`.

---

## Đáng sửa

### 1. [TRUNG BÌNH] Cookie `state` của luồng Facebook OAuth thiếu `secure`

[oauth/start/route.ts](../../src/app/api/facebook/oauth/start/route.ts) đặt cookie bằng tay:

```ts
cookieStore.set(OAUTH_STATE_COOKIE, state, {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 600,
});
```

Thiếu `secure`. Cookie phiên của Better Auth thì có — `defaultCookieAttributes` đặt
`secure: process.env.NODE_ENV === "production"`. Chỗ này viết tay nên không thừa hưởng.

Đây là token chống CSRF của đường nối Fanpage. Trên máy dev (`http://localhost`) không có gì để
mất; nhưng GĐ5 đưa app lên Railway chạy HTTPS, và từ lúc đó thiếu `secure` nghĩa là cookie sẵn
sàng đi qua kênh không mã hóa. Mục 2 ngay dưới đây tạo ra đúng một kênh như thế.

### 2. [TRUNG BÌNH] `back()` trong `oauth/start` ghép `http://` cứng

```ts
const base = host ? `http://${host}` : request.url;
```

Mọi lượt quay về báo lỗi của luồng OAuth đẩy người dùng sang **http://**. Trên Railway đó là một
nhịp hạ cấp giao thức — Railway sẽ đẩy ngược lên HTTPS, nhưng request đầu tiên đã đi bằng plaintext,
và theo mục 1 thì cookie `state` đi kèm nó.

`oauth/callback` **không** dính: nó dùng `new URL("/facebook", request.url)`. Chỉ một hàm lệch.

Lý do dòng này tồn tại là đúng và đã ghi trong chú thích (Next chuẩn hóa `request.url` về host của
dev server). Chỉ thiếu vế giao thức: đọc `x-forwarded-proto`, không có thì lấy `https` khi
`NODE_ENV === "production"`.

### 3. [TRUNG BÌNH] `updateAccount` không gác theo chủ nick, trong khi `revealCredential` có gác

Đường **đọc** bí mật của một nick đi qua `requireNickOwner` — OPERATOR chỉ mở được nick của mình.
Đường **ghi đè** đúng những cột đó thì không: [vault-update-actions.ts:95](../../src/lib/accounts/vault-update-actions.ts#L95)
chỉ có `guardedAction`, tức bất kỳ ai đã đăng nhập.

Nên một OPERATOR làm được với nick của đồng nghiệp:

- ghi đè `passwordEnc` / `emailPasswordEnc` / `totpSecretEnc` — chủ nick mất đường tra lại mật khẩu
  đang dùng thật (kho là chỗ duy nhất giữ nó);
- đổi `status` từ `SHADOWBANNED`/`CHECKPOINT` về `HEALTHY` — mở lại đường đăng cho một nick đang
  bị cách ly, tức vô hiệu hóa luật 1-3 cho nick đó;
- gỡ `proxyId`.

Không leo thang được thành đọc bí mật, nên đây là chuyện toàn vẹn chứ không phải rò rỉ. Nhưng bất
đối xứng thì có thật, và nó không có chú thích nào giải thích là cố ý — trong khi mọi quyết định
phân quyền khác của dự án đều có.

Có thể là chủ ý (sửa karma/trạng thái hộ nhau là việc thường ngày). Nếu vậy nên nói ra ở đâu đó,
và cân nhắc gác riêng ba cột bí mật thay vì gác cả hàm.

> **Đã kiểm kỹ chỗ nguy hiểm nhất và nó đúng:** `...data` trải thẳng vào `prisma.account.update`,
> nên nếu `accountUpdateSchema` có `ownerId` thì một OPERATOR tự phong mình làm chủ nick người khác
> rồi đọc mật khẩu. Schema **không có** trường đó, zod cắt khóa lạ, và `ownerId` chỉ ghi được từ
> `assignAccountOwner` — vốn là `adminAction`. Không có đường leo thang.

## Nhỏ hơn

| # | Chỗ | Việc |
|---|---|---|
| 4 | `revealCredential` / `requestOtpCode` | Không có giới hạn nhịp. Một phiên bị trộm rút sạch bí mật của mọi nick người đó làm chủ trong vài giây; `AuditLog` ghi lại nhưng không ai đọc lúc đó. Nội bộ 5-6 người nên rủi ro thấp — nhưng GĐ3 sắp viết lại đúng hai hàm này thành phát vé, và đó là lúc rẻ nhất để đặt hạn nhịp |
| 5 | `createAccount` | Không đặt `ownerId`, nên nick mới luôn vô chủ và **chính người vừa tạo cũng không lấy được mật khẩu của nó** cho tới khi ADMIN phân công. Hỏng đóng — đúng hướng — nhưng luồng có một hố mà không màn hình nào báo trước. Thêm một câu ở màn hình tạo nick, hoặc tự gán chủ là người tạo khi họ không phải ADMIN |
| 6 | `api/health/run` | `guardedRoute` chứ không `adminRoute`: OPERATOR nào cũng kích được lượt dò cho nick bất kỳ. Tốn băng thông proxy quan sát viên (thứ trả tiền theo GB) và giữ khóa chống chạy chồng. Đúng nguyên tắc "chia quyền làm, không chia tầm nhìn" thì nên gác — nhưng cũng có thể là chủ ý |

---

## Rất tốt, không cần đụng

- **`checkActor` dùng chung cho cả hai lớp gác.** `proxy.ts` gác trang, `guardedAction`/`guardedRoute`
  gác hành động, cả hai gọi đúng một hàm. Đây là chỗ hai lớp gác của phần lớn codebase bắt đầu lệch
  nhau, và thiết kế này làm việc lệch trở nên bất khả.
- **Vai trò tính lại từ biến môi trường ở mỗi request**, không tin cột `User.role`. Gỡ email khỏi
  `ALLOWED_EMAILS` + khởi động lại là mất quyền ngay, kể cả tab đang mở — đúng như README hứa.
- **`role: { input: false }`** trong cấu hình Better Auth. Thiếu cờ này thì người đăng nhập tự khai
  `role: "ADMIN"` trong request đăng ký. Lỗi kinh điển, đã bịt, và có chú thích nói rõ vì sao.
- **`readEmailAccessList` ném lỗi khi thiếu biến** thay vì trả danh sách rỗng, và bắt luôn ca
  `ADMIN_EMAILS` ⊄ `ALLOWED_EMAILS` — lỗi cấu hình im lặng kiểu tệ nhất.
- **Cố ý không xử lý mẹo Gmail** (bỏ dấu chấm, cắt sau dấu `+`). Nghe tiện, nhưng nó nới danh sách
  trắng theo hướng người viết danh sách không nhìn thấy được.
- **`isSameOrigin` đối chiếu header `Host`, không dùng `request.url`** — có ghi ngày đo và ca hỏng
  cụ thể (02/08/2026, mở bằng `127.0.0.1` thì guard chặn nhầm chính mình).
- **OAuth callback gác cả `state` lẫn đăng nhập**, kèm giải thích đúng vì sao một mình `state`
  không đủ: người lạ tự mở luồng OAuth thì `state` khớp hoàn hảo.
- **`guardedRoute` trả 401/403 thật**, không nhét `{ ok: false }` vào HTTP 200.
- **`revealCredential` giải mã trước rồi mới ghi `AuditLog`** — ghi trước thì nhật ký nói bí mật đã
  lộ trong khi thật ra không ai đọc được gì.

## Câu chưa trả lời

1. Mục 3 — `updateAccount` mở cho mọi OPERATOR là chủ ý hay sót? Nếu chủ ý thì có gác riêng ba cột
   bí mật không?
2. Mục 6 — `api/health/run` để mọi OPERATOR kích có phải chủ ý không?
