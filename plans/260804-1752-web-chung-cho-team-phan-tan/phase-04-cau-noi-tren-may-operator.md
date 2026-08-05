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

**Ưu tiên:** cao — **nằm trên đường găng** | **Trạng thái:** 🟡 đang làm — 12/18 việc (06/08/2026) |
**Dự kiến:** 4-6 ngày

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
7. **Ba ràng buộc trình duyệt của [GĐ0](plan.md#kết-quả-gđ0-đo-04082026--ba-ràng-buộc-bắt-buộc-cho-gđ234)
   là bắt buộc, không có đường thoát** — QĐ 10 chốt không đặt policy Chrome:
   lời gọi đầu trên mỗi máy nằm trong trình xử lý cú bấm · mọi lời gọi tự đặt hạn giờ ·
   *"chưa cấp quyền"* là trạng thái riêng, không gộp vào *"mất kết nối"*
8. **Gửi kèm phiên bản trong mọi phản hồi**, và từ chối vé đòi phiên bản cao hơn mình kèm câu
   *"bản cầu nối quá cũ, tải lại"* (QĐ 11 — không có bộ tự cập nhật)

## Hợp đồng HTTP đã chốt sẵn ở GĐ3

Phía web đã viết xong và **đang gọi bốn đường này**, nên chúng không còn là chỗ để quyết lại.
Khai đầy đủ ở [relay-endpoints.ts](../../src/lib/relay/relay-endpoints.ts) — đọc file đó trước
khi viết dòng nào của `http-server.ts`.

| Đường | Cách gọi | Trả về |
|---|---|---|
| `GET /health` | fetch ngầm | `{ ok, message, relayVersion, publicKey, antidetectReady }` |
| `POST /ticket` | fetch ngầm, body `{ ticket }` | `{ ok, message, relayVersion }` — vé mở profile |
| `/secret#<vé>` | **mở tab**, vé ở fragment | trang hiện mật khẩu / OTP, có nút chép, tự đóng |
| `POST /encrypt-for-vault` | fetch ngầm, body `{ password?, emailPassword?, totpSecret? }` | `{ ok, message, relayVersion, passwordEnc?, emailPasswordEnc?, totpSecretEnc? }` |

> **Thêm 06/08 khi làm việc 6:** cầu nối phục vụ thêm **`POST /secret/reveal`** — trang `/secret`
> đọc vé ở fragment rồi POST về đó. Cùng nguồn, và **cố ý không khai vào `relay-endpoints.ts`**:
> file đó là hợp đồng với web app, khai vào là mời web app gọi thẳng (QĐ 3 chặn đúng chỗ này).
>
> **Thêm 06/08 khi làm việc 5:** phản hồi từ chối một tấm vé mang kèm `rejectionCode`
> (`EXPIRED`, `ALREADY_USED`, `BAD_SIGNATURE`, `WRONG_DEVICE`, `RELAY_TOO_OLD`…). Web app hiện
> chưa đọc trường này — nó là **dấu vết để tìm lỗi**, vì mọi mã đều đã có sẵn câu tiếng Việt
> riêng trong `message`. Đừng để giao diện đi so chuỗi tiếng Việt để phân biệt hai loại hỏng.

Cổng cố định **47821**, và phải bind `127.0.0.1` chứ không phải `localhost` (trên Windows
`localhost` ra `::1` trước; máy chủ chỉ bind IPv4 sẽ từ chối nối, và kiểu hỏng đó phụ thuộc cấu
hình mạng từng máy chứ không phụ thuộc code).

**`/encrypt-for-vault` phải tự kiểm TOTP secret.** Máy chủ đã mất phép kiểm này ở GĐ3 — nó không
đọc nổi chuỗi đã bọc. Cầu nối chuẩn hóa (`normalizeTotpSecret`: bỏ khoảng trắng, viết hoa) rồi
kiểm bằng `isValidTotpSecret` **trước khi** bọc; secret hỏng thì trả `ok: false` kèm câu nói rõ.
Không kiểm thì secret rác nằm im trong kho tới ngày cần OTP gấp.

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

- [x] **XONG 06/08 — khung `relay/` + HTTP nghe `127.0.0.1`.**
      [relay-http-server](../../relay/src/relay-http-server.ts) (CORS đúng một nguồn, mọi phản
      hồi mang `relayVersion`, cổng bị chiếm thì báo rõ), [main](../../relay/src/main.ts),
      [relay-home](../../relay/src/relay-home.ts). Chạy thật: `npm run relay:dev`.
- [x] **XONG 06/08 — sinh cặp khóa của máy lúc cài, hiện khóa công khai để đăng ký.**
      [relay-device-keypair](../../relay/src/relay-device-keypair.ts) +
      [trang trạng thái](../../relay/src/relay-status-page.ts). File khóa hỏng thì **ném lỗi**,
      không âm thầm sinh cặp mới — sinh mới ở đó là biến một máy đã đăng ký thành máy lạ.
      Kèm `relayPrivateKeyToKeyObject` ở phía dùng chung, có test đối chiếu **vector RFC 7748**.
- [x] **XONG 06/08 — nạp khóa + chữ ký công khai, thiếu thì báo rõ.**
      [relay-config](../../relay/src/relay-config.ts). Thiếu cấu hình **không** làm cầu nối tắt:
      nó chạy nền và tự bật cùng máy, nên đổ lúc khởi động là không có gì để nhìn — triệu chứng
      duy nhất sẽ là *"không thấy cầu nối trên máy này"*, câu chỉ sai hướng hoàn toàn. Cầu nối
      vẫn nghe, trang trạng thái nói thiếu gì, và mọi đường làm việc thật từ chối thẳng.
      Gom **hết** vấn đề trong một lượt thay vì dừng ở cái đầu tiên.
- [x] **XONG 06/08 — hiện mã máy (`RelayDevice.id`) trên trang `/relay-devices`.**
      [relay-device-id-cell](../../src/components/relay/relay-device-id-cell.tsx) + cột mới ở
      [page](../../src/app/relay-devices/page.tsx). Cầu nối phải biết mã máy của chính nó để đối
      chiếu `TicketEnvelope.deviceId`, mà mã đó chỉ tồn tại **sau** khi ADMIN ghi máy vào sổ, và
      cầu nối không hỏi lại được (QĐ 5 — không nối mạng). Nên luồng cài là hai chiều: khóa công
      khai đi lên, **mã máy đi xuống**.
      Hiện **đủ chuỗi**, khác với khóa công khai bên cạnh: khóa công khai chỉ để đối chiếu bằng
      mắt nên cắt ngắn được, còn mã máy là để chép đi dán — một chuỗi cụt dán vào cấu hình hỏng
      mãi tận lượt bấm nút đầu tiên, dưới câu *"vé này phát cho máy khác"*, câu không hề chỉ về
      phía chuỗi bị cụt. Kèm nút chép, và nhánh dự phòng khi `navigator.clipboard` vắng mặt
      (mở web app qua http trong LAN là rơi vào đó).
- [x] **XONG 06/08 — giải mã vé bằng khóa riêng của máy.**
      [relay-identity](../../relay/src/relay-identity.ts) là chỗ **duy nhất** biến hai chuỗi hex
      trong cấu hình thành hai `KeyObject`; dựng khóa rải rác là mở đường cho hai chỗ hiểu cùng
      một chuỗi theo hai kiểu, mà kiểu hỏng đó hiện ra dưới dạng *"chữ ký sai"*. Sổ chống dùng
      lại buộc vào danh tính để chắc chắn cả tiến trình chỉ có **một** sổ.
- [x] **XONG 06/08 — xác minh vé: chữ ký / hết hạn / chống dùng lại.**
      [handle-ticket](../../relay/src/handle-ticket.ts) dùng lại nguyên `verifyTicket` của GĐ3.
      Thêm [ticket-payload-schema](../../relay/src/ticket-payload-schema.ts): chữ ký chứng minh
      *máy chủ phát tấm vé này*, **không** chứng minh hai bên hiểu cùng một hình dạng — mà một
      bản `.exe` từ tháng trước sẽ gặp ruột vé của tháng này (QĐ 11). `verifyTicket` trả
      `unknown` chính là để bắt buộc bước soi này.
      **`POST /ticket` chỉ nhận vé mở profile** — nhận vé bí mật ở đây là mở một đường trả mật
      khẩu qua fetch, đúng thứ QĐ 3 chặn. Có test canh.
- [x] **XONG 06/08 — mở profile qua adapter, giữ quy tắc đẩy hỏng thì không mở.**
      [launch-profile](../../relay/src/launch-profile.ts) +
      [relay-antidetect](../../relay/src/relay-antidetect.ts). Cầu nối dựng adapter riêng chứ
      không dùng `antidetect-adapter-factory`: factory đọc `process.env`, còn cầu nối cấu hình
      bằng `relay-config.json` — kéo factory sang là kéo theo giả định "có biến môi trường", và
      nó sẽ im lặng dùng mặc định thay vì nói ra là chưa cấu hình.
      **Token MultiZen là tùy chọn**: chỉ một trong ba việc cần nó, máy chỉ dùng để lấy mật khẩu
      vẫn phải chạy đủ. Kết quả kiểm MultiZen nhớ 30 giây vì `/health` bị gọi ở **mọi** cú bấm
      (ràng buộc 1 của spike GĐ0).
- [x] **XONG 06/08 — trang hiện mật khẩu + nút chép + tự đóng.**
      [secret-page](../../relay/src/secret-page.ts) (HTML+JS viết tay, không thư viện) và
      [handle-secret](../../relay/src/handle-secret.ts) — **chỗ duy nhất trong cả hệ mở được mật
      khẩu nick**.
      Phát sinh một đường mới: **`POST /secret/reveal`**. Fragment không được gửi lên máy chủ
      nào *kể cả máy chủ này*, nên trang phải đọc vé bằng JavaScript rồi POST ngược lại — cùng
      nguồn, nên không phải một đường mới ra ngoài. Cố ý **không** khai vào `relay-endpoints.ts`:
      file đó là hợp đồng với **web app**, và khai đường này vào đó là mời web app gọi thẳng,
      đúng thứ QĐ 3 chặn.
      Trang xóa vé khỏi thanh địa chỉ ngay khi mở (`replaceState`); tự đóng sau 60 giây kèm đồng
      hồ đếm ngược và nút *"Giữ mở"* — tab đóng đột ngột lúc đang chép dở khó chịu hơn cả không
      tự đóng. Header: `no-store`, `X-Frame-Options: DENY`, CSP `default-src 'none'`.
- [x] **XONG 06/08 — sinh OTP kèm số giây còn lại.** Dùng lại `totp-code-generator`. Trang đếm
      ngược tới lúc mã hết hạn rồi làm mờ mã và bảo lấy mã mới — hiện một mã đã chết mà không
      nói gì là để người ta dán vào rồi tự hỏi vì sao sai. Kèm lưới cuối cho TOTP secret hỏng
      trong kho: máy chủ mất phép kiểm base32 từ GĐ3 nên câu *"sửa lại TOTP secret trên web
      app"* phải tới được từ đây.
- [x] **XONG 06/08 — mã hóa ciphertext vùng operator lúc tạo/sửa nick, kèm phép kiểm TOTP base32.**
      [handle-encrypt-for-vault](../../relay/src/handle-encrypt-for-vault.ts).
      **Đường này cố ý không cần vé:** vé trả lời *"máy chủ có cho phép việc này không"*, cần khi
      thứ đi ra là bí mật của kho. Ở đây chiều ngược lại — thứ đi vào là bí mật người dùng vừa tự
      gõ, thứ đi ra là ciphertext không ai đọc nổi. Bắt phải có vé là bắt máy chủ ký giấy phép
      cho người ta mã hóa chuỗi của chính họ: không thêm lớp bảo vệ nào, chỉ thêm một vòng gọi.
      TOTP secret hỏng thì **không bọc luôn cả hai ô kia** — trả nửa vời là ghi mật khẩu mới vào
      kho mà TOTP thì không, trong khi người dùng đọc "đã lưu". Secret được **chuẩn hóa trước khi
      bọc**, vì chuỗi đã mã hóa thì sau này không sửa lại được mà không nhập lại từ đầu.
- [x] **XONG 06/08 — trang trạng thái.** Thêm mục *"Cấu hình đang dùng"*: mã máy và nguồn web —
      hai giá trị sai thì hỏng theo kiểu khó đoán nhất (*"vé phát cho máy khác"* và lỗi CORS
      không câu nào chỉ vào đây). **Không in khóa vùng operator và token**, chỉ nói có hay chưa:
      trang này là thứ người ta mở ra giữa buổi chia sẻ màn hình với người đang giúp mình sửa lỗi.
      Kiểu dữ liệu vào của trang **không có chỗ** cho hai bí mật đó, thay vì nhận cả `RelayConfig`
      rồi tự nhớ đừng in ra.
      Trang **hỏi MultiZen ngay lúc vẽ** — bản đầu in ra kết quả nhớ từ lần `/health` nào đó
      trước, kèm câu "bấm tải lại trang để cầu nối hỏi" trong khi tải lại trang không hề hỏi.
- [x] **XONG 06/08 — `.exe` 87.4 MB, dựng bằng Node SEA chứ không phải bun.**
      [build-relay-executable](../../scripts/build-relay-executable.ts) — `npm run relay:build`.
      **Đảo thứ tự so với kế hoạch (bun trước, SEA là đường lùi), có lý do:** phần khó của cầu
      nối là mật mã lạ — X25519 sealed box, Ed25519, dựng `KeyObject` từ khóa thô — và bộ test
      chứng minh nó đúng *trên Node 24*. Chạy đúng phần đó trên runtime của bun là đem thứ không
      được phép sai sang chỗ chưa ai đo, đổi lấy vài chục MB. SEA thì `.exe` **chính là**
      `node.exe` đã chạy bộ test. bun cũng chưa cài trên máy này, nên "đường lùi" hóa ra rẻ hơn
      cả đường chính.
      Bốn bước: esbuild gom cây import (110.7 KB — cũng là phép đo xem có gì lọt vào bundle
      không) → `--experimental-sea-config` → chép `node.exe` ra làm phôi → postject nhét blob.
      Chặn build trên non-Windows: SEA gói runtime của **máy đang build**, nên build ở Docker ra
      một file tên `.exe` mà là ELF, và nó chỉ lộ ra ở tận máy operator.
      Hai lỗi Windows gặp lúc làm, cả hai đã ghi lại tại chỗ trong mã: `shell: true` cắt đường
      dẫn ở dấu cách (`C:\Program Files` → lệnh `C:\Program`), nên gọi thẳng file JS của
      esbuild/postject bằng `process.execPath`, không qua `npx`.
- [x] **XONG 06/08 — bộ cài: `setup.bat` + `install-relay.ps1`, shortcut Startup + desktop.**
      **`.bat` chỉ còn là vỏ ASCII gọi PowerShell**, vì cmd.exe đọc file `.bat` bằng cách nhớ vị
      trí **byte** rồi đọc tiếp từ đó sau mỗi lệnh — một ký tự UTF-8 nhiều byte làm lệch hết, và
      bản đầu viết tiếng Việt có dấu vỡ thành những lệnh như `'xist'`, `'ARGET_EXE" >nul'`.
      Ba việc đáng ghi:
      - **Đường nâng cấp là cùng một file.** Chạy lại thì tắt bản đang chạy (nó giữ file `.exe`
        nên không chép đè được), chép bản mới, và **giữ nguyên `relay-config.json`** — ghi đè ở
        đó là xóa khóa vùng operator của máy, thứ không lấy lại được ở đâu.
      - **Shortcut tạo tên ASCII rồi đổi tên.** `WScript.Shell` là COM đời cũ, ép mọi chuỗi về
        bảng mã ANSI: trên máy Windows tiếng Anh thì "Cầu nối" thành "C?u n?i", `?` không hợp lệ
        trong tên file, và `Save()` ném `FileNotFoundException` — câu chẳng liên quan gì tới
        nguyên nhân. Cùng lý do bỏ hẳn `Description`.
      - **`WindowStyle = 7`** (thu nhỏ), cố ý không ẩn hẳn: cầu nối giữ khóa vùng operator và mở
        một cổng trên máy — người ngồi đó phải thấy được là nó đang chạy và tắt được mà không
        cần Task Manager.
      `install-relay.ps1` **phải giữ BOM UTF-8** (PowerShell 5.1 không BOM thì đọc theo ANSI và
      nát hết tiếng Việt trong bộ cài). Build có phép kiểm bắt buộc BOM, đỏ thì dừng.
- [x] **XONG 06/08 — nghiệm thu chạy trên chính `.exe`.**
      [smoke-test-relay-executable](../../scripts/smoke-test-relay-executable.ts) +
      [harness](../../scripts/relay-executable-harness.ts) — `npm run relay:verify`, **16/16
      PASS**. Bộ test chạy mã nguồn dưới vitest; đóng gói là phép biến đổi khác hẳn, và nó đổi
      nghĩa của mọi giả định về *file nằm ở đâu* (`process.execPath` thành chính `.exe`,
      `__dirname` biến mất). Bài này nói chuyện với `.exe` qua đúng con đường web app dùng, và đi
      tới tận mật khẩu dạng trần: tiến trình test phát vé thật → `.exe` mở ra → so với chuỗi đã
      gửi. Phép kiểm "gọi `/health` thấy 200" thì mật mã hỏng sau khi gói vẫn xanh, và triệu
      chứng đầu tiên sẽ là một operator đứng trước câu "không mở được ruột vé" vào ngày bàn giao.
      Ca đỏ đầu tiên là lỗi của **bài kiểm**, không phải của cầu nối: nó gửi cùng một vé bí mật
      vào `/ticket` rồi mới tới `/secret/reveal`, mà `verifyTicket` tiêu vé **trước** khi kiểm
      loại vé — hỏng theo hướng đóng, đúng thứ cần có.
- [x] **XONG 06/08 — web báo rõ khi cầu nối chưa chạy.**
      Nút *Mở profile* đã nói đủ từ trước qua `describeRelayFailure`. Ba nút bí mật thì không:
      chúng mở tab rồi đoán — *"không thấy gì hiện ra nghĩa là cầu nối chưa chạy"*, câu đẩy việc
      chẩn đoán sang cho người dùng và sai luôn khi cửa sổ trắng vì lý do khác.
      Nay [panel](../../src/app/accounts/[id]/account-vault-actions-panel.tsx) bắn `pingRelay()`
      **sau khi tab đã mở** và chỉ đổi câu ở nhánh `unreachable`. Hai chỗ cố ý ngược nhau:
      `launchProfile()` ping ở **dòng đầu, còn kích hoạt người dùng** vì nó *cần* quyền mạng nội
      bộ; `openSecretTab()` ping **sau `await`, mất kích hoạt** nên hộp xin quyền không hiện —
      tab bí mật cùng nguồn với cầu nối nên không cần quyền đó, mà một hộp xin quyền bật lên
      giữa lúc bấm "Mật khẩu nick" chỉ nhận được một câu trả lời là *"không biết, chặn đi"*, và
      cú chặn ấy nằm lại làm hỏng nút *Mở profile* về sau. Cùng lý do, `no-permission` bị bỏ
      qua: nó không nói gì về tab kia.
      **Vá một lỗi im lặng phát hiện lúc làm việc này:** chuỗi features có `noopener`, mà
      `noopener` làm `window.open()` trả `null` — đúng giá trị của "popup bị chặn". Tức **mọi**
      cú bấm mật khẩu/OTP đều rơi vào nhánh báo chặn popup và không ai lấy được bí mật. Xanh
      qua typecheck, lint và cả 770 test vì phần này chỉ nghiệm thu được khi cầu nối chạy thật.
      Nay cắt opener bằng `disownPopup()` — gán `win.opener = null` lúc cửa sổ còn ở
      `about:blank` (cùng nguồn nên gán được), vẫn giữ handle để điều hướng. Có phép canh nguồn
      [secret-popup-features.test.ts](../../src/lib/relay/secret-popup-features.test.ts) vì
      thêm lại `noopener` là phản xạ đúng ở mọi chỗ khác của web.
- [ ] Phục vụ file `.exe` sau lớp đăng nhập; web cảnh báo khi cầu nối chạy bản cũ
- [x] **XONG 06/08 (thực ra từ GĐ3) — vé mang phiên bản tối thiểu, cầu nối quá cũ từ chối.**
      Máy chủ khai `minRelayVersion` vào từng vé
      ([ticket-issuer](../../src/lib/tickets/ticket-issuer.ts)), cầu nối so với `RELAY_VERSION`
      của chính nó và ném `RELAY_TOO_OLD` kèm câu bảo tải lại
      ([ticket-verifier](../../src/lib/tickets/ticket-verifier.ts)), có test ở
      [ticket-lifecycle.test.ts](../../src/lib/tickets/ticket-lifecycle.test.ts). Ô này bị bỏ
      quên chưa tick chứ không phải chưa làm. Phần **web hiện dải "cầu nối bản cũ, tải bản mới"**
      vẫn còn thiếu — nằm ở việc phục vụ `.exe` ngay trên.
- [x] **XONG 06/08 — test chặn import `lib/db` / `next` vào `relay/`.**
      [relay-import-boundary.test.ts](../../src/lib/relay/relay-import-boundary.test.ts). Chặn
      thêm React, alias `@/`, và `lib/auth/` — cầu nối **không tự quyết ai được đọc gì**, kéo lớp
      phân quyền vào là dựng lại quyết định đó ở chỗ thứ hai. Test nằm ở `src/` chứ không ở
      `relay/`: một phép canh biên giới mà tự nằm trong vùng nó canh thì mất cùng lúc với thứ nó
      canh.
- [x] **XONG 06/08 — test từ chối vé giả / quá hạn / dùng lại.**
      [handle-ticket.test.ts](../../relay/src/handle-ticket.test.ts) đo **hai đầu thật**: máy chủ
      phát bằng `issueTicket`, cầu nối nhận bằng `handleTicketRequest`. Không giả lập bộ phát vé
      — giá trị duy nhất của bài test này là chứng minh hai chương trình viết rời hiểu nhau, mà
      một bản giả lập thì luôn hiểu chính nó. Gồm cả ca "không lộ mật khẩu proxy ra câu trả lời
      kể cả khi hỏng".

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
