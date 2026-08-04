# Phase 04 — Cầu nối trên máy operator

## Context

- [plan.md](plan.md) — quyết định 3, 5, 6
- Phụ thuộc: [Phase 00](phase-00-spike-trinh-duyet-goi-cau-noi.md) (chặn đường),
  [Phase 03](phase-03-tach-hai-vung-khoa-va-ve-ky.md)
- Module dùng lại: [credential-encryption](../../src/lib/crypto/credential-encryption.ts),
  [totp-code-generator](../../src/lib/totp/totp-code-generator.ts),
  [multizen-mcp-client](../../src/lib/antidetect/multizen-mcp-client.ts),
  [multizen-adapter](../../src/lib/antidetect/multizen-adapter.ts),
  [adspower-adapter](../../src/lib/antidetect/adspower-adapter.ts)

## Overview

**Ưu tiên:** cao — **nằm trên đường găng** | **Trạng thái:** chưa làm | **Dự kiến:** 4-6 ngày

Một file `.exe` chạy nền trên máy người vận hành. Việc của nó: nhận vé từ trình duyệt, xác minh
chữ ký máy chủ, giải mã bằng khóa operator, rồi hoặc mở profile MultiZen, hoặc hiện mật khẩu/OTP.

Nằm trên đường găng vì quyết định 8 chọn bàn giao một lần — phase này trượt là không có gì bàn giao.

## Key Insights

- **929 dòng đã có test là đúng thứ cầu nối cần**, gần như không thừa. Viết lại bằng ngôn ngữ khác
  đồng nghĩa nuôi hai bản định dạng mã hóa — lệch một chi tiết là giải mã ra rác, và chỉ lộ ra
  đúng lúc cần mật khẩu gấp.
- **Cầu nối không nối mạng ra ngoài.** Chỉ nghe `127.0.0.1` và gọi MultiZen `:7777`.
- Cầu nối **không tự quyết ai được đọc gì** — nó chỉ kiểm chữ ký. Ít logic thì ít lỗ.
- Đường đi khác nhau theo loại việc (quyết định 3): mở profile gọi ngầm; bí mật đi qua tab nhỏ
  do chính cầu nối phục vụ, nên **mật khẩu không bao giờ vào trang web hosted**.

## Requirements

1. Một `.exe`, chạy trên Windows không cài Node
2. Tự chạy khi bật máy
3. Trang trạng thái xem được: đang chạy chưa, nối được MultiZen chưa, khóa nạp đúng chưa
4. Ba việc: mở profile, hiện mật khẩu, sinh OTP
5. Mã hóa ciphertext vùng operator khi tạo/sửa nick
6. Từ chối vé sai chữ ký, quá hạn, hoặc đã dùng

## Architecture

```
relay/
├── src/
│   ├── http-server.ts          nghe 127.0.0.1, CORS chặt một nguồn
│   ├── ticket-verifier.ts      giải mã vé + xác minh Ed25519 + hết hạn + chống dùng lại
│   ├── device-keypair.ts       sinh cặp khóa riêng của máy này lúc cài
│   ├── launch-profile.ts       vé mở profile → adapter antidetect
│   ├── reveal-secret.ts        vé bí mật → trang nhỏ hiện mật khẩu / OTP
│   ├── encrypt-for-vault.ts    mã hóa ciphertext vùng operator
│   ├── config-store.ts         khóa operator + chữ ký công khai máy chủ
│   └── pages/                  trang trạng thái + trang hiện bí mật
└── build.ts                    bun build --compile
```

Import từ `src/lib/` qua đường dẫn tương đối. **Không dựng workspace.**

## Related Code Files

**Tạo:** toàn bộ `relay/`; `relay/setup.bat` (tạo shortcut Startup + shortcut desktop)
**Tạo test:** chặn `relay/` lỡ import `src/lib/db` hoặc `next` — cùng kiểu với
[encrypted-field-registry.test.ts](../../src/lib/crypto/encrypted-field-registry.test.ts)
**Sửa:** `package.json` — script `relay:build`
**Sửa:** giao diện web — nút gọi cầu nối, và **thông báo rõ khi cầu nối chưa chạy**

## Implementation Steps

1. Khung `relay/` + máy chủ HTTP nghe `127.0.0.1`, cổng cố định
2. Lần chạy đầu: **sinh cặp khóa riêng của máy này**, hiện khóa công khai trên trang trạng thái
   để ADMIN chép vào màn hình đăng ký cầu nối trên web
3. Nạp cấu hình: khóa operator + chữ ký công khai máy chủ + cặp khóa của máy. Thiếu thì trang
   trạng thái nói rõ thiếu gì, **không im lặng chạy tiếp**
4. `ticket-verifier`: **giải mã vé bằng khóa riêng của máy**, rồi kiểm chữ ký, hết hạn, chống
   dùng lại (nhớ id vé đã dùng trong bộ nhớ)
4. Mở profile: nhận vé kèm cấu hình proxy → gọi adapter antidetect.
   **Giữ nguyên quy tắc: đẩy proxy hỏng thì KHÔNG mở profile**
5. Trang hiện bí mật: giải mã, hiện, nút copy, tự đóng sau một khoảng
6. Sinh OTP: dùng lại `totp-code-generator`, hiện kèm số giây còn lại
7. `encrypt-for-vault` cho luồng tạo/sửa nick
8. Trang trạng thái: đang chạy, phiên bản, nối MultiZen được không, khóa nạp đúng không
9. `bun build --compile` → `.exe`. Trượt thì lùi Node SEA
10. `setup.bat`: chép `.exe` vào thư mục cố định, tạo shortcut Startup + shortcut desktop
11. Web phát hiện cầu nối chưa chạy và hướng dẫn bật lại
12. **Phát hành + cảnh báo bản cũ (QĐ 11).** Cầu nối gửi kèm số phiên bản trong mọi phản hồi;
    web hiện dải *"cầu nối bản cũ, tải bản mới ở đây"* trỏ tới đường tải nằm sau đăng nhập.
    **Không có bộ tự cập nhật** — nó đục thủng đúng tính chất ngoại tuyến mà QĐ 5 dựng cả
    thiết kế lên. Vé của GĐ3 mang số phiên bản tối thiểu: cầu nối quá cũ phải từ chối kèm câu
    *"bản cầu nối quá cũ, tải lại"*, chứ không hỏng mơ hồ ở bước giải mã khi định dạng vé đổi
13. Test: vé giả, vé quá hạn, vé dùng lại — cả ba phải bị từ chối

## Todo List

- [ ] Khung `relay/` + HTTP nghe `127.0.0.1`
- [ ] Sinh cặp khóa của máy lúc cài, hiện khóa công khai để đăng ký
- [ ] Nạp khóa + chữ ký công khai, thiếu thì báo rõ
- [ ] Giải mã vé bằng khóa riêng của máy
- [ ] Xác minh vé: chữ ký / hết hạn / chống dùng lại
- [ ] Mở profile qua adapter, giữ quy tắc đẩy hỏng thì không mở
- [ ] Trang hiện mật khẩu + nút copy + tự đóng
- [ ] Sinh OTP kèm số giây còn lại
- [ ] Mã hóa ciphertext vùng operator lúc tạo/sửa nick
- [ ] Trang trạng thái
- [ ] `bun build --compile` ra `.exe` chạy trên Windows sạch
- [ ] `setup.bat` + shortcut Startup + shortcut desktop
- [ ] Web báo rõ khi cầu nối chưa chạy
- [ ] Phục vụ file `.exe` sau lớp đăng nhập; web cảnh báo khi cầu nối chạy bản cũ
- [ ] Vé mang phiên bản tối thiểu; cầu nối quá cũ từ chối kèm câu nói rõ phải làm gì
- [ ] Test chặn import `lib/db` / `next` vào `relay/`
- [ ] Test từ chối vé giả / quá hạn / dùng lại

## Success Criteria

- `.exe` chạy trên **một máy Windows khác, không cài Node**, mở được profile với proxy đúng
- Tắt cầu nối → web nói rõ "cầu nối chưa chạy", **không phải nút bấm không phản hồi**
- Mật khẩu hiện ra ở tab của cầu nối; **kiểm bằng devtools: trang hosted không hề chạm tới nó**
- Ba loại vé hỏng đều bị từ chối
- `npm test` xanh, gồm cả test chặn import

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Spike Phase 00 trượt → phải làm lại giao diện phần mở profile | trung bình | Phase 00 làm trước tiên; hai đường dùng chung phần lớn code |
| `relay/` vô tình kéo Prisma/Next vào `.exe` | trung bình | Test chặn import; kiểm kích thước file `.exe` |
| Cổng cố định bị chương trình khác chiếm | thấp | Chọn cổng lạ; trang trạng thái báo rõ nếu không nghe được |
| SmartScreen chặn `.exe` chưa ký | thấp | Cài hộ ở [Phase 06](phase-06-ban-giao-team.md); không mua chứng chỉ (quyết định plan.md) |

## Security Considerations

- `Access-Control-Allow-Origin` khai **đúng một nguồn** là domain web chung. Không `*`
- Trang hiện bí mật tự đóng, **không lưu vào lịch sử trình duyệt**, không ghi ra file
- Khóa operator nằm trong file cấu hình cạnh `.exe` — quyền thư mục chỉ cho người dùng đó
- Cầu nối **không mở cổng ra mạng ngoài**, chỉ `127.0.0.1`
- Không ghi vé hay bí mật ra log, kể cả log lỗi

## Next Steps

Xong → [Phase 05](phase-05-len-railway-cron-sao-luu.md) nếu chưa làm song song, rồi
[Phase 06](phase-06-ban-giao-team.md).
