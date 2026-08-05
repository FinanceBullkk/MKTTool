# Phase 03 — Tách hai vùng khóa + vé ký

## Context

- [plan.md](plan.md) — quyết định 1, 2, 5
- Phụ thuộc: [Phase 02](phase-02-dang-nhap-vai-tro-chu-so-huu.md)
- [credential-encryption.ts](../../src/lib/crypto/credential-encryption.ts),
  [encrypted-field-registry.ts](../../src/lib/crypto/encrypted-field-registry.ts),
  [vault-credential-actions.ts](../../src/lib/accounts/vault-credential-actions.ts)

## Overview

**Ưu tiên:** cao | **Trạng thái:** 🟡 đang làm — 5/11 việc (05/08/2026) | **Dự kiến:** 3-4 ngày

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
- [ ] Module vé: **mã hóa cho cầu nối đích**, ký, xác minh, hết hạn, chống dùng lại
- [ ] `revealCredential` / `requestOtpCode` → phát vé
- [ ] Vé mở profile kèm cấu hình proxy
- [ ] Tạo/sửa nick: ciphertext vùng operator dựng ở phía máy người dùng
- [x] `vault:rekey` tách hai vùng (`--domain=server|operator`, bắt buộc)
- [x] `vault:smoke` cập nhật — thêm phép thử "khóa server KHÔNG mở được mật khẩu nick"
- [ ] **Kiểm bằng grep: không còn chỗ nào trên máy chủ giải mã cột vùng operator**

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
