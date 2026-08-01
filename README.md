# MKTTool

Bảng điều khiển nhiều tài khoản cho team marketing — đăng content lên Reddit và Facebook Pages
mà không bị shadowban hay bóp tương tác.

**Trạng thái:** Phase 01 (Kho danh tính) và Phase 02 (Hàng đợi content + Bộ luật an toàn) đã xong.
Xem [kế hoạch triển khai](plans/260801-2030-multi-account-posting-console/plan.md).

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
| `npm run rules:smoke` | Kiểm chứng nghiệm thu Phase 02 (bộ luật) trên DB thật |

## Cách test

Nguyên tắc: **tách "test công cụ" khỏi "test với nick thật"**. Chặng A và B không cần
proxy, không cần tài khoản nào, và kiểm tra được phần lớn chức năng.

| Chặng | Cần gì | Kiểm chứng điều gì |
|---|---|---|
| **A** | không gì cả | `npm run vault:smoke` + `npm run rules:smoke` + nhập dữ liệu giả qua UI: mã hóa, ràng buộc 1:1, copy mật khẩu, OTP (dùng `npm run vault:testotp` đối chiếu với Google Authenticator), và cả bộ luật an toàn |
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
5. **Content** (`/content`) — bài team viết; phải nằm ở đây thì bộ luật mới so trùng được
6. **Hàng đợi** (`/queue`) — xếp lịch đăng, bộ luật chấm trước khi cho lưu

## Bộ luật an toàn

Mỗi lần xếp lịch, 9 phép kiểm tra chạy trước và trả về `ALLOW | WARN | BLOCK` kèm lý do
tiếng Việt. Đèn hiện ngay lúc chọn nick/đích, không đợi tới lúc bấm lưu.

| # | Luật | Chặn khi |
|---|---|---|
| 1 | Sức khỏe nick | trạng thái khác `ALIVE` |
| 2 | Cold start | giờ đăng còn nằm trong cold-start |
| 3 | Điều kiện đích | thiếu karma hoặc nick chưa đủ tuổi theo luật sub |
| 4 | Hạn mức ngày | nick đã có 2 bài trong ngày đó |
| 5 | Nghỉ giữa 2 bài | hai bài cùng sub cách nhau dưới 24 tiếng |
| 6 | Tỷ lệ promo | chưa đủ 9 bài hữu ích cho bài quảng cáo tiếp theo |
| 7 | Trùng nội dung | giống ≥ 70% một bài cùng nền tảng trong 30 ngày |
| 8 | Đụng độ thread | nick khác của mình đã chạm đúng thread đó |
| 9 | Chính sách link | sub cấm link mà bài có link |

Luật 6 và 8 là hai luật không nền tảng nào tha thứ. **Luật 8 không cho ghi đè** — hai nick cùng chủ
đụng một thread là tín hiệu phối hợp rõ nhất mà nền tảng bắt được. Các luật còn lại ghi đè được
nhưng bắt buộc nhập lý do và luôn để lại `AuditLog`.

Ngưỡng nằm ở bảng `RuleConfig`, sửa bằng `npm run db:studio` — không cần sửa code, không cần
build lại. Thiếu key nào thì dùng mặc định trong `src/lib/rules/rule-thresholds.ts`.

> Đăng xong nhớ bấm **"Đã đăng"** và ghi lại các lần comment/upvote. Bộ luật chỉ biết những gì
> được ghi lại — không ghi thì luật chặn đụng độ thread không có gì để so.

## Kiến trúc

```
src/
├── app/                     Next.js App Router — trang và API
│   ├── accounts/            danh sách + chi tiết nick
│   ├── content/             kho content team viết
│   ├── queue/               hàng đợi + trang xếp lịch có chấm luật realtime
│   ├── personas/ proxies/ targets/
│   └── api/
│       ├── accounts/[id]/launch/   mở profile antidetect
│       └── rules/preview/          chạy thử bộ luật, trả verdict
├── components/              khối UI dùng chung (ui/, queue/, content/)
└── lib/
    ├── accounts/            server actions + quy tắc trạng thái nick
    ├── antidetect/          adapter MultiZen / AdsPower (đổi bằng 1 dòng .env)
    ├── content/             từ vựng content + server action kho content
    ├── crypto/              AES-256-GCM cho credential
    ├── db/                  Prisma client
    ├── format/ platforms/   định dạng ngày, gộp họ nền tảng
    ├── queue/               server action cho job + tương tác
    ├── rules/               bộ luật an toàn — mỗi luật một file
    └── totp/                sinh mã OTP 2FA
```

Mỗi luật là một hàm thuần `(ctx: RuleContext) => RuleVerdict`. Toàn bộ việc hỏi database nằm ở
`rule-context-builder.ts`, nên thêm luật mới chỉ là thêm một file và một dòng trong `rules-engine.ts`.

Stack: Next.js 16 + TypeScript + Prisma 7 + SQLite + Playwright. Một process, chạy trên máy
bạn MKT. Chưa cần VPS, Docker, Postgres hay Redis — những thứ đó chỉ cần khi lên Phase 05.

## Antidetect browser

Sửa `ANTIDETECT_PROVIDER` trong `.env` thành `multizen` hoặc `adspower`. Không đụng code.

MultiZen đòi **bearer token**: lấy trong app ở `MCP → Connect an agent`, dán vào
`MULTIZEN_MCP_TOKEN`. Thiếu token là mọi lời gọi ăn HTTP 401.

> ⚠️ **Proxy phải được cấu hình TRONG MultiZen/AdsPower, theo từng profile.**
> MKTTool không đẩy proxy sang trình duyệt — nó chỉ lưu "proxy nào thuộc nick nào" (có mã hóa)
> và ép ràng buộc 1 proxy : 1 nick. Nhập proxy vào MKTTool mà quên nhập trong MultiZen thì
> trình duyệt vẫn chạy bằng IP nhà bạn. **Mở `ipinfo.io` kiểm tra sau mỗi lần mở profile mới.**

MultiZen không phơi endpoint CDP ra ngoài (Playwright không gắn vào được) — đó là **bình thường,
không phải lỗi**. Nó lái trình duyệt bằng chính tool MCP của nó (`navigate`, `click`, `type`,
`extract`, `screenshot`), và Phase 05 sẽ đi đường đó. AdsPower thì có trả về endpoint CDP.

## Bảo mật

- Mật khẩu, mật khẩu email, TOTP secret: mã hóa AES-256-GCM trước khi chạm database
- Khóa nằm ở biến môi trường, không nằm trong DB
- Mật khẩu không bao giờ render ra màn hình — bấm copy là chép thẳng vào clipboard
- Mọi lần lộ credential / mở profile đều ghi `AuditLog`
- App chỉ nghe localhost
- `.env` và `*.db` đã nằm trong `.gitignore`

## Việc chưa làm

- **Proxy chưa được đẩy tự động sang antidetect browser** — hiện phải nhập tay ở cả hai nơi.
  `update_profile` của MultiZen nhận được object proxy nên sẽ tự động hóa được.
- **Chưa kiểm chứng IP trong profile khớp proxy** (Chặng C) — mở profile đã chạy được từ
  02/08/2026, còn phần proxy thì chưa thử.
- Dò shadowban + theo dõi karma → Phase 03
- Facebook Pages qua Graph API → Phase 04
- Tự động đăng Reddit → Phase 05
