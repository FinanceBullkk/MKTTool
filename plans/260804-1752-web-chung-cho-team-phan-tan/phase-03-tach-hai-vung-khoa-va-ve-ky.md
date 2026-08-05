# Phase 03 — Tách hai vùng khóa + vé ký

## Context

- [plan.md](plan.md) — quyết định 1, 2, 5
- Phụ thuộc: [Phase 02](phase-02-dang-nhap-vai-tro-chu-so-huu.md)
- [credential-encryption.ts](../../src/lib/crypto/credential-encryption.ts),
  [encrypted-field-registry.ts](../../src/lib/crypto/encrypted-field-registry.ts),
  [vault-credential-actions.ts](../../src/lib/accounts/vault-credential-actions.ts)

## Overview

**Ưu tiên:** cao | **Trạng thái:** 🟡 đang làm — 7/11 việc (05/08/2026) | **Dự kiến:** 3-4 ngày

Chia kho mã hóa làm hai vùng, và dựng cơ chế **vé có chữ ký** để máy chủ ủy quyền cho cầu nối
mà không cần biết nội dung.

Sau phase này, **chiếm được máy chủ không mở được một mật khẩu nick nào**.

## Key Insights

- Đã kiểm bằng grep: **không có luồng nghiệp vụ nào trên máy chủ cần mật khẩu nick.** Bí mật nick
  chỉ xuất hiện ở 3 chỗ — tạo, sửa, và lộ ra để copy. Ranh giới sạch, không phải hy vọng.
- Mật khẩu proxy thì **ngược lại**: máy chủ cần để kiểm proxy sống và đo băng thông → thuộc vùng
  máy chủ. Cầu nối nhận cấu hình proxy **đã dựng sẵn** trong vé, không cần khóa proxy.
- Token Facebook cũng thuộc vùng máy chủ — máy chủ phải dùng nó để gọi Graph API.
- Vé mang sẵn ciphertext nên **cầu nối không cần nối mạng ra ngoài**.
- Mỗi cầu nối có **cặp khóa riêng**, khai báo công khai với máy chủ lúc cài. Máy chủ **mã hóa
  nội dung vé cho đúng cầu nối đó** → trang web không đọc được gì bên trong vé, kể cả mật khẩu
  proxy. Lợi thêm ngoài dự kiến: **mất laptop thì thu hồi đăng ký cầu nối đó là xong** — máy đó
  hết nhận được ciphertext mới, không phải xoay khóa operator trên toàn bộ máy của team.
- Máy chủ ghi `CREDENTIAL_REVEALED` **lúc phát vé** — đó mới là thời điểm bí mật rời kho, và máy
  chủ tự biết chứ không nghe trình duyệt khai.

## Requirements

1. Hai biến khóa tách bạch: `VAULT_KEY_SERVER`, `VAULT_KEY_OPERATOR`
2. Máy chủ **không bao giờ** giữ `VAULT_KEY_OPERATOR`
3. Vé ký bằng Ed25519, hết hạn ~30 giây, dùng một lần
4. **Nội dung vé mã hóa cho riêng cầu nối nhận** — trình duyệt chỉ là người đưa thư
5. Mỗi cầu nối đăng ký khóa công khai với máy chủ; thu hồi được từng cái
6. `vault:rekey` tách hai quy trình theo vùng
7. **Vé mang phiên bản định dạng + phiên bản cầu nối tối thiểu** (QĐ 11) — trường này phải có
   **ngay từ vé đầu tiên**, không thêm sau. Vì không có bộ tự cập nhật, cầu nối cũ sẽ còn chạy
   ngoài kia rất lâu sau khi máy chủ đổi định dạng vé; thiếu trường này thì cầu nối cũ hỏng ở
   bước giải mã kèm câu vô nghĩa, thay vì nói thẳng *"bản cầu nối quá cũ, tải lại"*.
   Thêm một trường vào định dạng đã chốt thì chính nó là thay đổi phá vỡ tương thích — đúng thứ
   nó sinh ra để tránh

## Architecture

| Vùng | Cột | Ai giải mã |
|---|---|---|
| **Máy chủ** | `Proxy.passwordEnc`, `ObserverProxy.passwordEnc`, `FacebookConnection.accessTokenEnc`, `FacebookPage.accessTokenEnc` | máy chủ |
| **Operator** | `Account.passwordEnc`, `Account.emailPasswordEnc`, `Account.totpSecretEnc` | chỉ cầu nối |

```
bấm nút ─► máy chủ: kiểm phiên + kiểm chủ nick + ghi AuditLog
                └─► phát VÉ {loại, ciphertext hoặc cấu hình proxy, hết hạn,
                             phiên bản định dạng, cầu nối tối thiểu} + chữ ký
                      └─► trình duyệt mang xuống cầu nối
                            └─► cầu nối xác minh chữ ký → giải mã → dùng
```

> **Lời gọi từ trình duyệt xuống cầu nối phải theo ba ràng buộc đã đo ở [GĐ0](plan.md#kết-quả-gđ0-đo-04082026--ba-ràng-buộc-bắt-buộc-cho-gđ234).**
> Ngắn gọn: lời gọi đầu trên mỗi máy nằm trong trình xử lý cú bấm; **mọi** lời gọi tự đặt hạn
> giờ (bị chặn thì fetch treo im, không ném lỗi); và trạng thái *"chưa cấp quyền"* phải tách khỏi
> *"mất kết nối"*. QĐ 10 chốt không đặt policy Chrome, nên **không có đường thoát khỏi ba ràng
> buộc này** — chúng là bắt buộc, không phải khuyến nghị.

## Related Code Files

**Sửa:**
- [encrypted-field-registry.ts](../../src/lib/crypto/encrypted-field-registry.ts) — thêm
  `domain: "server" | "operator"` cho từng cột; test đọc schema đã có sẽ bắt lệch
- [encryption-key-loader.ts](../../src/lib/crypto/encryption-key-loader.ts) — nạp hai khóa
- [vault-credential-actions.ts](../../src/lib/accounts/vault-credential-actions.ts) —
  **đổi vai trò**: không giải mã nữa, chuyển thành nơi phát vé
- [vault-create-actions.ts](../../src/lib/accounts/vault-create-actions.ts) /
  [vault-update-actions.ts](../../src/lib/accounts/vault-update-actions.ts) — nhận ciphertext
  đã mã hóa sẵn cho cột vùng operator, không mã hóa tại máy chủ
- [rekey-vault-key.ts](../../scripts/rekey-vault-key.ts) — tách theo vùng
- `.env.example`

**Tạo:**
- `src/lib/tickets/` — dựng vé, ký, xác minh, hết hạn, chống dùng lại
- `src/lib/tickets/ticket-types.ts` — dùng chung với cầu nối ở Phase 04

## Implementation Steps

1. Thêm `domain` vào registry; sửa test đọc schema cho khớp
2. `encryption-key-loader` nạp hai khóa; **máy chủ khai báo rõ nó không có khóa operator** và báo
   lỗi dễ hiểu nếu ai lỡ cấu hình ngược
3. Sinh cặp khóa Ed25519 cho máy chủ; thêm script `keys:server-keygen`
4. Model `RelayDevice` — tên máy, người dùng, khóa công khai, ngày đăng ký, cờ thu hồi.
   Màn hình cho ADMIN đăng ký và thu hồi
5. Module vé: dựng, **mã hóa cho khóa công khai của cầu nối đích**, ký, hết hạn 30s, chống dùng lại
5. Đổi `revealCredential` / `requestOtpCode` thành **phát vé**, không giải mã. Giữ nguyên
   `requireNickOwner` và giữ nguyên việc ghi `AuditLog`
6. Vé mở profile: máy chủ dựng cấu hình proxy bằng
   [proxy-config-builder.ts](../../src/lib/antidetect/proxy-config-builder.ts) rồi bỏ vào vé
7. Form tạo/sửa nick: mã hóa cột vùng operator **trước khi** gửi lên máy chủ
   (chi tiết ở [Phase 04](phase-04-cau-noi-tren-may-operator.md))
8. `vault:rekey` tách hai lệnh; giữ nguyên nguyên tắc "giải mã sạch toàn bộ trước khi ghi"
9. Cập nhật `vault:smoke` cho mô hình hai vùng

## Todo List

- [x] `domain` trong registry + test đọc schema
- [x] Nạp hai khóa, báo lỗi rõ khi cấu hình ngược
- [x] Cặp khóa Ed25519 + script sinh khóa (`keys:server-keygen`, đối chiếu vector RFC 8032)
- [x] Model `RelayDevice` + màn hình đăng ký / thu hồi cho ADMIN (`/relay-devices`)
  (chốt đã đóng: xem [dưới](#việc-4--những-chốt-đã-đóng))
- [x] Module vé: **mã hóa cho cầu nối đích**, ký, xác minh, hết hạn, chống dùng lại
  (chốt đã đóng: xem [dưới](#việc-5--module-vé))
- [ ] `revealCredential` / `requestOtpCode` → phát vé
- [ ] Vé mở profile kèm cấu hình proxy
- [ ] Tạo/sửa nick: ciphertext vùng operator dựng ở phía máy người dùng
- [x] `vault:rekey` tách hai vùng (`--domain=server|operator`, bắt buộc)
- [x] `vault:smoke` cập nhật — thêm phép thử "khóa server KHÔNG mở được mật khẩu nick"
- [ ] **Kiểm bằng grep: không còn chỗ nào trên máy chủ giải mã cột vùng operator**

### Việc phát sinh từ audit 05/08/2026

Nguồn: [audit GĐ3](../../plans/reports/audit-260805-1904-gd03-tach-hai-vung-khoa.md) và
[audit đường credential + auth](../../plans/reports/audit-260805-1913-duong-credential-va-auth.md).
Ba việc đã sửa xong ngay (cookie `state` thiếu `secure`, `http://` ghép cứng ở `oauth/start`,
`vault:rekey` chặn xoay sang khóa vùng kia). Số còn lại **cố ý hoãn** vì chúng nằm đúng trong
những file mà việc 5-7 sắp viết lại — sửa bây giờ là sửa hai lần.

Ba mục nhỏ trong sổ đăng ký cũng đã đóng cùng ngày:

- **Khe TOCTOU ở `registerRelayDevice`.** Hai admin dán cùng khóa cùng lúc thì `@unique` chặn
  người sau bằng P2002 ném thẳng ra khỏi server action — nút hỏng, không chữ nào. Nay bắt P2002
  rồi hỏi lại sổ để trả về **đúng câu** mà lượt kiểm thường vẫn trả. Test dựng lại khe bằng cách
  cho lượt hỏi đầu trả `null` một lần, và khẳng định sổ bị hỏi **đúng hai lần** — không có
  khẳng định đó thì bài test xanh nhờ lượt kiểm thường, trong khi nhánh nó mang tên chưa hề chạy.
- **Chủ máy bị gỡ khỏi `ALLOWED_EMAILS` sau khi đăng ký.** Sổ vẫn hiện "đang dùng" trong khi máy
  đó không xin nổi một vé nào. Không khai thác được, nhưng sổ này tồn tại để trả lời *"máy của
  tôi ổn chưa"* — trả lời sai đúng câu hỏi đó thì tệ hơn không có sổ. Nay có dòng cảnh báo cạnh
  email.
- **`AuditLog.action` gom về [audit-log-actions.ts](../../src/lib/audit/audit-log-actions.ts).**
  15 chuỗi literal rải 9 file; gõ sai một chữ thì hàng vẫn ghi, request vẫn xanh, không test nào
  đỏ — chỉ có câu truy vấn đi tìm nó sau này là hụt mất hàng, im lặng. Nợ cũ, và đợt sổ đăng ký
  vừa thêm hai chuỗi nữa nên trả luôn.

- [ ] **Gộp vào việc 7 — test canh vùng khóa cho đường TẠO nick.** Đường *sửa* đã có
  ([vault-edit-actions.database.test.ts](../../src/lib/accounts/vault-edit-actions.database.test.ts):
  đặt hai khóa khác nhau rồi đọc lại bằng khóa operator). Đường *tạo* thì không có test nào —
  không file test nào import `vault-create-actions.ts`. Mã hôm nay đúng, nhưng việc 7 viết lại
  đúng hàm đó, và kiểu hỏng này chỉ lộ ra vào ngày `vault:rekey --domain=operator`, tức đúng ngày
  nghiệm thu cả phase. Tính chất phải giữ **trước và sau** việc 7: *dữ liệu nick tạo ra chỉ mở
  được bằng khóa operator*.
- [x] **ĐÃ CHỐT VÀ LÀM 05/08 — `updateAccount` gác phần bí mật, KHÔNG gác phần vận hành.**
  Câu hỏi của audit gộp hai chuyện cần hai lời giải khác nhau.

  *Ghi đè mật khẩu nick người khác* → gác bằng `requireNickOwner`, và lý do quyết định là
  **tính đối xứng**: `revealCredential` đã gác rồi, nên không gác chỗ này tức là *"tôi không đọc
  được mật khẩu nick của bạn, nhưng tôi ghi đè được nó"* — không giải thích nổi cho ai. Chỉ gác
  khi form **thật sự mang bí mật lên**; ô để trống nghĩa là giữ nguyên, và sửa karma / trạng thái
  / proxy cho nick của đồng nghiệp là việc chung hằng ngày của team 5-6 người. Siết cả những lần
  đó thì phép kiểm sẽ bị gỡ chứ không được sửa.

  *Kéo `status` từ `SHADOWBANNED` về `HEALTHY`* → **không giải bằng phân quyền.** Chủ nick cũng
  ép được, và ép trên nick của chính mình thì luật 1-3 vẫn bị vô hiệu y hệt — phép kiểm chủ sở
  hữu không nhắm đúng chỗ. Thứ thật sự thiếu là **dấu vết**: `ACCOUNT_UPDATED` chỉ ghi trạng thái
  mới. Nay ghi cả chiều đổi (`SHADOWBANNED → ALIVE`), khớp với `HEALTH_STATUS_FORCED` mà đường
  còn lại đã ghi từ lâu — hai đường tới cùng một hậu quả thì nhật ký phải đọc được như nhau.

  **Làm ngay thay vì đợi việc 7**: việc 7 đổi *cách credential đi vào* (ciphertext dựng ở máy
  người dùng), không đổi *ai được gọi* — dòng gác nằm ở tầng khác nên không phải làm hai lần.
  Ngược lại, sau việc 7 máy chủ **không đọc được** thứ gửi lên, nên ghi đè lúc đó còn khó lần ra
  hơn. Test canh cả hai phía ranh giới ở
  [vault-update-owner-guard.database.test.ts](../../src/lib/accounts/vault-update-owner-guard.database.test.ts).

- [ ] **Gộp vào việc 11 — bỏ giá trị mặc định của `encryptCredential`.** Hiện quên tham số khóa =
  ghi nhầm vùng, không lỗi, không test nào đỏ. Registry test chỉ đối chiếu schema ↔ registry,
  không chạm chỗ gọi. 12 chỗ gọi ngoài test, mỗi chỗ thêm một tham số — và thêm xong thì "cột này
  thuộc vùng nào" hiện ngay tại chỗ đọc mã. Làm ở việc 11 vì lúc đó bốn chỗ chạm vùng operator đã
  dọn xong, số chỗ phải sửa còn ít nhất.
- [ ] **Khay cảnh báo vận hành — một vùng, nhiều mục, lọc theo vai trò.** Cảnh báo đầu tiên phải
  đưa vào: *"hai vùng đang dùng chung một khóa"*, hiện chỉ là `console.warn` trong
  `encryption-key-loader.ts` — trên Railway (GĐ5) đó là chỗ không ai đọc, in một lần lúc khởi
  động rồi trôi. Mà trạng thái đó nghĩa là **cả GĐ3 chưa có tác dụng gì**.

  **Chốt 05/08: không gộp làm một dải với cảnh báo "cầu nối bản cũ" của QĐ 11, cũng không để
  hai dải rời nhau.** Hai cảnh báo khác nhau ở đúng chỗ quan trọng nhất — *ai sửa được*:

  | | Phạm vi | Ai sửa được | Sửa bằng gì |
  |---|---|---|---|
  | Hai vùng chung khóa | Toàn hệ | Chỉ ADMIN | Đổi `.env` + khởi động lại |
  | Cầu nối bản cũ | Một máy | Người ngồi máy đó | Tải lại `.exe` |

  Gộp một câu thì người đọc phải tự đoán phần nào dành cho mình — với cảnh báo, "tự đoán" nghĩa
  là bỏ qua. Để rời hai chỗ thì cái thứ hai bị bỏ qua theo cách khác. Đường thứ ba giải cả hai:
  **một vùng cố định dưới header**, mỗi vấn đề **một dòng riêng với hành động riêng**, lọc theo
  người xem. Cảnh báo thứ ba (GĐ5 sắp thêm) khi đó chỉ là thêm một mục, không phải quyết lại
  chỗ đặt.
- [ ] **Gộp vào việc 6 — câu từ chối quyền phải tới được người dùng.** `revealCredential` /
  `requestOtpCode` để `AuthorizationError` ném trần ra khỏi server action, còn
  `account-vault-actions-panel.tsx` bắt bằng `catch {}` rồi hiện một câu chung. Nên OPERATOR bấm
  nhầm nick của đồng nghiệp **không đọc được** câu *"nick này do người khác phụ trách"* — đúng
  thứ chú thích đầu `guarded-action.ts` viết ra để tránh, và `updateAccount` đã làm đúng
  (trả `ActionResult`, xem commit `2427c4b`). Chặn vẫn đúng, chỉ có lời giải thích là mất.
  **Hoãn tới việc 6 vì việc đó viết lại cả hai đầu** — hàm chuyển sang phát vé, và panel cũng
  phải đổi để nhận vé rồi chuyển xuống cầu nối. Chưa ai dùng app nên chưa ai chịu câu khó hiểu đó.
- [ ] **Gộp vào việc 6 — hạn nhịp cho đường phát vé.** `revealCredential` / `requestOtpCode` hiện
  không có giới hạn nào: một phiên bị trộm rút sạch bí mật của mọi nick người đó làm chủ trong vài
  giây, `AuditLog` ghi lại nhưng không ai đọc lúc đó. Việc 6 viết lại đúng hai hàm này, nên đó là
  lúc rẻ nhất để đặt.

### Việc 5 — module vé

Xong 05/08/2026. Sáu file trong `src/lib/tickets/`: [ticket-types](../../src/lib/tickets/ticket-types.ts)
(hợp đồng dùng chung với GĐ4), [sealed-box](../../src/lib/tickets/ticket-sealed-box.ts),
[issuer](../../src/lib/tickets/ticket-issuer.ts), [verifier](../../src/lib/tickets/ticket-verifier.ts),
[replay-guard](../../src/lib/tickets/ticket-replay-guard.ts), và test vòng đời hai đầu.

Bốn chốt đóng trong lúc làm:

- **Bọc trước, ký sau.** Chữ ký phủ lên cả bao ngoài lẫn ruột đã bọc, nên cầu nối xác minh được
  **trước khi** giải mã bất cứ thứ gì — nó không bao giờ phải bóc một gói chưa có bảo chứng.
  Ngược lại (ký rồi bọc) thì chữ ký nằm trong lớp mã hóa, và cách duy nhất để biết vé có thật
  không là cứ giải mã đã.
- **Ký lên CHUỖI, không ký lên object.** Chữ ký phủ đúng chuỗi base64url truyền đi, và cầu nối
  xác minh trên đúng chuỗi nó nhận — không bên nào tuần tự hóa lại. Cầu nối GĐ4 là chương trình
  viết độc lập; `JSON.stringify` hai bên có thể xếp khóa khác thứ tự. Ký lên object là hẹn trước
  một ngày mọi vé bị từ chối mà không ai tìm ra vì sao.
- **Cặp khóa dùng một lần cho mỗi tấm vé**, không phải cặp cố định của máy chủ. Cặp cố định thì
  mọi vé gửi tới cùng một máy dùng chung một khóa AES — lộ một lần là lộ cả lịch sử. Máy chủ
  không cần chứng minh mình là ai ở lớp này; chữ ký Ed25519 đã làm việc đó. Bí mật chung đi qua
  HKDF chứ không dùng thẳng: đầu ra X25519 là tọa độ một điểm, không phải khóa phân bố đều.
- **Chống dùng lại nằm ở cầu nối** — hệ quả của QĐ 5, không phải lựa chọn. Cầu nối không nối
  mạng nên không hỏi máy chủ được *"vé này tiêu chưa"*; máy chủ cũng không biết vì nó phát vé rồi
  thôi. Sổ jti giữ trong bộ nhớ: vé sống 30 giây, khởi động lại thì vé cũ cũng đã hết hạn.

Thứ tự các phép kiểm trong `verifyTicket` là một phần của thiết kế, không phải chuyện thẩm mỹ:
chữ ký trước tiên (trước đó không trường nào đáng tin, kể cả `exp`), rồi **hai phép kiểm phiên
bản** — để câu trả lời cho cầu nối cũ luôn là *"bản quá cũ, tải lại"* chứ không phải một lỗi giải
mã mơ hồ — rồi mới tới hạn, đúng máy, chưa tiêu, và cuối cùng mới giải mã. Vé bị chặn vì quá hạn
**không** bị ghi vào sổ đã tiêu; có test canh cả thứ tự đó.

### Việc 4 — những chốt đã đóng

Xong 05/08/2026. Gồm: model + migration, [relay-device-key.ts](../../src/lib/tickets/relay-device-key.ts)
(chuẩn hóa hex, dựng `KeyObject`, chặn khóa bậc thấp) + test đối chiếu vector RFC 7748,
[relay-device-actions.ts](../../src/lib/tickets/relay-device-actions.ts) + test trên DB thật,
màn hình [/relay-devices](../../src/app/relay-devices/page.tsx), và `npm run keys:relay-keygen`.

Bốn chốt đã đóng lại trong lúc làm, không có trong bản kế hoạch gốc:

- **Khóa máy là X25519, không phải Ed25519.** Hai cặp khóa làm hai việc ngược chiều: máy chủ
  **ký** (Ed25519), máy **nhận đồ mã hóa gửi tới** (X25519). Dùng chung một cặp cho cả hai việc
  là thứ mọi tài liệu mật mã dặn đừng làm, và ở đây chẳng đổi lại được gì vì cầu nối tự sinh
  khóa của nó.
- **Đúng độ dài hex chưa đủ để nhận một khóa.** Có một nhóm điểm bậc thấp cho ra bí mật chung
  toàn số 0 với *mọi* khóa đối diện — tức ai cũng mở được vé. Màn hình đăng ký thử trao khóa một
  lần với cặp tạm để chặn cả nhóm, thay vì chép bảng điểm xấu vào mã rồi mong nó đủ.
- **Thu hồi là một chiều, và hàng ở lại trong sổ.** `revokedAt` là mốc thời gian chứ không phải
  cờ boolean, và không có đường bật lại. Khóa của một chiếc máy đã mất coi như đã lộ; cho đăng
  ký lại đúng khóa đó là xóa sạch ý nghĩa của lần thu hồi. Giữ hàng lại thì `@unique` còn chặn
  được việc đăng ký lại, và câu *"bị chặn từ lúc nào"* còn chỗ trả lời — xóa hàng là mất cả hai.
- **Cả team đọc được sổ, chỉ ADMIN ghi.** Khóa công khai lộ cũng không mất gì, nên giấu danh
  sách chẳng bảo vệ được gì mà lại lấy mất câu trả lời cho *"máy tôi vào sổ chưa?"*. Đúng nguyên
  tắc đã theo từ GĐ2: chia **quyền làm**, không chia **tầm nhìn**.

Ranh giới phải nói ra mỗi lần nhắc tới thu hồi — và câu thông báo sau khi bấm nút có nói:
thu hồi chặn **vé mới**, nhưng **không** với tới ciphertext chiếc máy đó đã lấy về từ trước.
Mất máy thì vẫn phải xoay `VAULT_KEY_OPERATOR`. Có test canh đúng câu nhắc đó.

### Còn nợ từ bước 2

- Chốt chặn *"máy chủ không được giữ `VAULT_KEY_OPERATOR`"* **chưa cài được**: tới khi bước 5 và 7
  xong thì máy chủ vẫn thật sự cần khóa đó để tạo/sửa nick và hiện bí mật. Cài sớm là app dừng.
  Thay vào đó bộ nạp khóa cảnh báo khi hai vùng dùng chung một khóa — trạng thái đúng lúc chuyển
  đổi nhưng nhìn y hệt lúc đã tách xong, nên phải nói ra.
- Bốn chỗ trên máy chủ còn chạm vùng operator, đúng bằng danh sách phải dọn ở bước 5 và 7:
  `vault-create-actions.ts`, `vault-update-actions.ts`, và hai chỗ trong
  `vault-credential-actions.ts`. Grep `loadVaultKey("operator")` trong `src/` là ra đủ —
  Success Criteria cuối phase chính là grep này phải rỗng.

## Success Criteria

- Grep toàn `src/` (trừ `relay/`): không có lời gọi giải mã nào chạm
  `Account.passwordEnc` / `emailPasswordEnc` / `totpSecretEnc`
- Xóa `VAULT_KEY_OPERATOR` khỏi môi trường máy chủ → **app vẫn chạy đủ mọi chức năng**, chỉ mật
  khẩu và OTP là không lấy được. Đây là phép thử chính của phase.
- Vé quá 30 giây → cầu nối từ chối. Vé dùng lại lần hai → từ chối.
- **Mở devtools lúc bấm "Mở profile": nội dung vé phải là chuỗi mã hóa**, không đọc được mật khẩu proxy
- Thu hồi một `RelayDevice` → máy đó không nhận được vé mới nữa
- `vault:smoke` xanh trên DB thật

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Xoay khóa nửa chừng → dữ liệu không mở được | **cao** | Giữ nguyên nguyên tắc hiện có: giải mã sạch toàn bộ trước khi ghi, tự sao lưu, ghi trong một transaction |
| Chia nhầm vùng cho một cột | cao | Registry + test đọc schema; phép thử "xóa khóa operator" ở Success Criteria bắt được ngay |
| Vé bị nhặt lại dùng | trung bình | Hết hạn 30s + đánh dấu đã dùng |

## Security Considerations

- Nội dung vé **mã hóa cho riêng cầu nối nhận**, nên mật khẩu proxy không lộ ra trang web.
  (Bản nháp đầu để hở chỗ này với lý do "người đó vào `/proxies` cũng xem được" — đúng nhưng
  là lý lẽ của phương án rẻ, không phải phương án tốt. Đã sửa.)
- Thu hồi một cầu nối **không** làm mất hiệu lực ciphertext nó đã lấy trước đó. Mất laptop thì
  vẫn nên xoay khóa operator — thu hồi chỉ là chặn ngay lập tức, không thay việc xoay khóa
- Chữ ký công khai của máy chủ đem đi phân phát; **khóa riêng không bao giờ rời máy chủ**
- Vé không được ghi vào log dưới dạng đầy đủ

## Next Steps

Xong → [Phase 04](phase-04-cau-noi-tren-may-operator.md).
