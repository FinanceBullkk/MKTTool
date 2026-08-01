# MKTTool

Bảng điều khiển nhiều tài khoản cho team marketing — đăng content lên Reddit và Facebook Pages
mà không bị shadowban hay bóp tương tác.

**Trạng thái:** Phase 01 (Kho danh tính) đã xong. Xem
[kế hoạch triển khai](plans/260801-2030-multi-account-posting-console/plan.md).

## Đây là gì

Không phải bot farm. Là "tủ hồ sơ + bảng điều khiển" cho **một** bạn MKT vận hành 5-8 nick Reddit
và 1-3 Fanpage. Team tự viết content, công cụ lo phần danh tính và an toàn.

Nguyên tắc bất di bất dịch: **1 nick = 1 proxy tĩnh = 1 vân tay = 1 nhân vật.**
Ràng buộc này do database ép, không lách được.

## Yêu cầu

- Node.js 22+ (dự án đang chạy trên 24)
- Một antidetect browser: [MultiZen](https://getmultizen.com/) (miễn phí) hoặc AdsPower
- Proxy tĩnh (static ISP), mỗi nick một IP

## Cài đặt

```bash
npm install
cp .env.example .env
npm run vault:keygen        # dán VAULT_KEY vào .env
npm run db:migrate
npm run dev                 # http://localhost:3000
```

> **VAULT_KEY phải được sao lưu vào password manager.** Mất khóa là mất toàn bộ mật khẩu và
> TOTP secret của mọi nick, không khôi phục được bằng bất kỳ cách nào.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở localhost:3000 |
| `npm test` | Chạy unit test |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run build` | Build production |
| `npm run db:migrate` | Áp migration |
| `npm run db:studio` | Mở Prisma Studio xem database |
| `npm run vault:keygen` | Sinh khóa mã hóa mới |
| `npm run vault:smoke` | Kiểm chứng nghiệm thu Phase 01 trên DB thật |
| `npm run vault:testotp` | Sinh TOTP secret dùng thử để kiểm chứng tính năng OTP |

## Cách test

Nguyên tắc: **tách "test công cụ" khỏi "test với nick thật"**. Chặng A và B không cần
proxy, không cần tài khoản nào, và kiểm tra được phần lớn chức năng.

| Chặng | Cần gì | Kiểm chứng điều gì |
|---|---|---|
| **A** | không gì cả | `npm run vault:smoke` + nhập dữ liệu giả qua UI: mã hóa, ràng buộc 1:1, copy mật khẩu, OTP (dùng `npm run vault:testotp` đối chiếu với Google Authenticator) |
| **B** | MultiZen (miễn phí) | Profile trống, không đăng nhập gì. Bấm "Mở profile" → Playwright có nối được không (câu hỏi chặn đường của Phase 00) |
| **C** | 1 proxy bất kỳ | Mở profile → vào trang kiểm tra IP → phải khớp proxy đã cấu hình. Không đăng nhập tài khoản nào |
| **D** | nick thật + proxy đúng loại | Chỉ làm sau khi A/B/C xong. Xem quy trình cold-start ở [Phase 00](plans/260801-2030-multi-account-posting-console/phase-00-preparation-and-feasibility-check.md) |

> Đừng gộp proxy test với proxy dùng thật. Proxy datacenter giá rẻ dùng để kiểm tra
> "profile có ăn đúng IP không" thì được, nhưng đưa tài khoản thật vào đó là giết tài khoản.

## Thứ tự nhập liệu

1. **Nhân vật** (`/personas`) — mỗi nick một giọng, một mảng nội dung
2. **Proxy** (`/proxies`) — mua proxy TRƯỚC khi mua nick
3. **Tài khoản** (`/accounts`) — gắn nhân vật + proxy, đặt cold-start 14 ngày
4. **Đích đăng** (`/targets`) — subreddit kèm luật thật của sub đó

## Kiến trúc

```
src/
├── app/                     Next.js App Router — trang và API
│   ├── accounts/            danh sách + chi tiết nick
│   ├── personas/ proxies/ targets/
│   └── api/accounts/[id]/launch/   mở profile antidetect
├── components/ui/           khối UI dùng chung
└── lib/
    ├── accounts/            server actions + quy tắc trạng thái nick
    ├── antidetect/          adapter MultiZen / AdsPower (đổi bằng 1 dòng .env)
    ├── crypto/              AES-256-GCM cho credential
    ├── db/                  Prisma client
    └── totp/                sinh mã OTP 2FA
```

Stack: Next.js 16 + TypeScript + Prisma 7 + SQLite + Playwright. Một process, chạy trên máy
bạn MKT. Chưa cần VPS, Docker, Postgres hay Redis — những thứ đó chỉ cần khi lên Phase 05.

## Đổi antidetect browser

Sửa `ANTIDETECT_PROVIDER` trong `.env` thành `multizen` hoặc `adspower`. Không đụng code.

## Bảo mật

- Mật khẩu, mật khẩu email, TOTP secret: mã hóa AES-256-GCM trước khi chạm database
- Khóa nằm ở biến môi trường, không nằm trong DB
- Mật khẩu không bao giờ render ra màn hình — bấm copy là chép thẳng vào clipboard
- Mọi lần lộ credential / mở profile đều ghi `AuditLog`
- App chỉ nghe localhost
- `.env` và `*.db` đã nằm trong `.gitignore`

## Việc chưa làm

- **Playwright chưa được kiểm chứng có nối được MultiZen không** — câu hỏi chặn đường của
  [Phase 00](plans/260801-2030-multi-account-posting-console/phase-00-preparation-and-feasibility-check.md).
  Kho danh tính vẫn dùng bình thường nếu chỉ mở profile thao tác tay.
- Hàng đợi content + bộ luật an toàn → Phase 02
- Dò shadowban + theo dõi karma → Phase 03
- Facebook Pages qua Graph API → Phase 04
- Tự động đăng Reddit → Phase 05
