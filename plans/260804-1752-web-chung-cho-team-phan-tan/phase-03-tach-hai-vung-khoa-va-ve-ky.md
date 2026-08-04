# Phase 03 — Tách hai vùng khóa + vé ký

## Context

- [plan.md](plan.md) — quyết định 1, 2, 5
- Phụ thuộc: [Phase 02](phase-02-dang-nhap-vai-tro-chu-so-huu.md)
- [credential-encryption.ts](../../src/lib/crypto/credential-encryption.ts),
  [encrypted-field-registry.ts](../../src/lib/crypto/encrypted-field-registry.ts),
  [vault-credential-actions.ts](../../src/lib/accounts/vault-credential-actions.ts)

## Overview

**Ưu tiên:** cao | **Trạng thái:** chưa làm | **Dự kiến:** 3-4 ngày

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

- [ ] `domain` trong registry + test đọc schema
- [ ] Nạp hai khóa, báo lỗi rõ khi cấu hình ngược
- [ ] Cặp khóa Ed25519 + script sinh khóa
- [ ] Model `RelayDevice` + màn hình đăng ký / thu hồi cho ADMIN
- [ ] Module vé: **mã hóa cho cầu nối đích**, ký, xác minh, hết hạn, chống dùng lại
- [ ] `revealCredential` / `requestOtpCode` → phát vé
- [ ] Vé mở profile kèm cấu hình proxy
- [ ] Tạo/sửa nick: ciphertext vùng operator dựng ở phía máy người dùng
- [ ] `vault:rekey` tách hai vùng
- [ ] `vault:smoke` cập nhật
- [ ] **Kiểm bằng grep: không còn chỗ nào trên máy chủ giải mã cột vùng operator**

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
