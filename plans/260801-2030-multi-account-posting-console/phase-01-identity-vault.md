# Phase 01 — Kho danh tính (Identity Vault)

## Context Links
- [plan.md](plan.md) | [Phase 00](phase-00-preparation-and-feasibility-check.md)

## Overview
- **Priority:** P0
- **Status:** ✅ Hoàn thành 01/08/2026
- **Thời lượng:** 5-7 ngày (thực tế: 1 phiên)
- **Mục đích:** Một chỗ duy nhất lưu nick + proxy + vân tay + nhân vật, gắn cứng 1:1, credential mã hóa.
  Mở đúng profile bằng 1 click, không phải nhớ mật khẩu, không bao giờ bật nhầm proxy.

## Key Insights

1. **Gắn cứng 1:1 là quy tắc bất di bất dịch.** 1 nick = 1 IP = 1 vân tay = 1 profile antidetect.
   Reddit shadowban tức thì nếu 2 nick chung IP cùng tương tác một bài.
2. **Không lưu credential dạng trần.** Blueprint gốc đề xuất `two_factor_secret VARCHAR(64)` —
   một lần lộ DB là mất sạch nick kể cả 2FA. Mã hóa AES-256-GCM ở tầng ứng dụng.
3. **`persona` tách khỏi `account`.** Một nhân vật (giọng, mảng nội dung) có thể có nick ở nhiều
   nền tảng. Tách ra để Phase 02 kiểm tra trùng nội dung theo nhân vật.
4. SQLite là đủ. 11 nick, 1 người dùng, 1 máy. Prisma cho phép đổi sang Postgres sau bằng 1 dòng config.

## Requirements

### Functional
- CRUD: personas, accounts, proxies, platform_targets
- Ràng buộc DB: 1 proxy chỉ gắn 1 account (unique), 1 account chỉ 1 proxy
- Mã hóa/giải mã: mật khẩu nick, mật khẩu email, mật khẩu proxy, TOTP secret
- Sinh mã OTP 6 số từ TOTP secret, hiển thị kèm đồng hồ đếm ngược
- Nút "Mở profile" → gọi antidetect browser mở đúng profile
- Trạng thái nick: `COLD_START | ALIVE | CHECKPOINT | SHADOWBANNED | DEAD`
- Chặn thao tác nếu `now < cold_start_until`

### Non-functional
- Khóa mã hóa nằm ngoài DB (biến môi trường / file `.key` ngoài repo)
- Mở profile < 10 giây
- File DB có thể sao lưu bằng cách copy 1 file

## Architecture

```
Next.js App (localhost:3000)
├── app/                    UI: danh sách nick, form, nút mở profile
├── app/api/                Route handlers
├── lib/
│   ├── crypto/             AES-256-GCM encrypt/decrypt, quản lý khóa
│   ├── totp/               sinh mã OTP từ secret
│   ├── antidetect/         adapter mở profile (multizen | adspower)
│   └── db/                 Prisma client
└── prisma/schema.prisma
```

**Adapter antidetect** — quan trọng: viết interface trước, 2 cài đặt sau. Kết quả Phase 00 quyết định
dùng cái nào; interface giữ nguyên nên đổi không tốn công.

```ts
// lib/antidetect/antidetect-browser-adapter.ts
export interface AntidetectAdapter {
  launchProfile(profileId: string): Promise<{ cdpEndpoint: string }>;
  closeProfile(profileId: string): Promise<void>;
  isRunning(profileId: string): Promise<boolean>;
}
```

## Database Schema (Prisma)

```prisma
model Persona {
  id            String   @id @default(cuid())
  name          String                      // "Minh - dev backend"
  voice         String                      // mô tả giọng điệu
  contentAngle  String                      // mảng nội dung phụ trách
  accounts      Account[]
}

model Proxy {
  id        String   @id @default(cuid())
  host      String
  port      Int
  username  String
  passwordEnc String                        // mã hóa
  country   String
  type      String   @default("STATIC_ISP") // STATIC_ISP | MOBILE
  account   Account?                        // 1:1
}

model Account {
  id                String   @id @default(cuid())
  platform          String                  // REDDIT | FACEBOOK
  username          String
  passwordEnc       String
  emailAddress      String                  // email gốc mua kèm
  emailPasswordEnc  String
  totpSecretEnc     String?
  antidetectProfileId String                // id profile bên MultiZen/AdsPower
  personaId         String
  proxyId           String   @unique        // ép 1:1
  status            String   @default("COLD_START")
  karma             Int      @default(0)    // Reddit
  platformCreatedAt DateTime?               // tuổi nick trên nền tảng
  purchasedAt       DateTime?
  coldStartUntil    DateTime?
  lastActionAt      DateTime?
  quarantineReason  String?
  persona           Persona  @relation(fields: [personaId], references: [id])
  proxy             Proxy    @relation(fields: [proxyId], references: [id])
  @@unique([platform, username])
}

model PlatformTarget {                      // subreddit hoặc FB group
  id                String  @id @default(cuid())
  platform          String
  name              String                  // "r/selfhosted"
  url               String
  minKarma          Int     @default(0)
  minAccountAgeDays Int     @default(0)
  promoRatio        Int     @default(9)     // 9 bài hữu ích : 1 quảng cáo
  allowsLinks       Boolean @default(true)
  notes             String?
  @@unique([platform, name])
}

model AuditLog {
  id        String   @id @default(cuid())
  at        DateTime @default(now())
  accountId String?
  action    String
  detail    String?
}
```

## Related Code Files

**Tạo mới:**
- `prisma/schema.prisma`
- `lib/crypto/credential-encryption.ts` — AES-256-GCM, đọc khóa từ env
- `lib/crypto/encryption-key-loader.ts` — nạp & kiểm tra khóa, báo lỗi rõ nếu thiếu
- `lib/totp/totp-code-generator.ts` — dùng `otplib`
- `lib/antidetect/antidetect-browser-adapter.ts` — interface
- `lib/antidetect/multizen-adapter.ts`
- `lib/antidetect/adspower-adapter.ts`
- `lib/db/prisma-client.ts`
- `app/accounts/page.tsx` — danh sách nick + trạng thái
- `app/accounts/[id]/page.tsx` — chi tiết, hiện OTP, nút mở profile
- `app/api/accounts/[id]/launch/route.ts`
- `app/personas/page.tsx`, `app/proxies/page.tsx`, `app/targets/page.tsx`

**Lưu ý modularization:** mỗi file giữ dưới 200 dòng. Tách form/table thành component riêng
trong `components/accounts/`.

## Implementation Steps

1. `npx create-next-app` + cài `prisma`, `@prisma/client`, `otplib`, `playwright`.
2. Viết `schema.prisma` như trên, `prisma migrate dev`.
3. Viết module mã hóa trước, có test: encrypt → decrypt → bằng chuỗi gốc; sai khóa → ném lỗi.
4. Viết TOTP generator, test bằng secret mẫu đối chiếu với Google Authenticator.
5. Viết interface adapter + 1 cài đặt (theo kết luận Phase 00). Cài đặt còn lại để trống ném
   `NotImplementedError`.
6. Dựng UI danh sách nick: bảng hiện tên, nền tảng, nhân vật, trạng thái, karma, IP, lần cuối hoạt động.
7. Trang chi tiết: nút "Copy mật khẩu", "Hiện OTP" (đếm ngược 30s), "Mở profile".
8. Chặn nút "Mở profile" nếu status là `DEAD`; cảnh báo vàng nếu `COLD_START` hoặc `CHECKPOINT`.
9. Nhập tay dữ liệu 11 nick từ bảng tính Phase 00 vào hệ thống.
10. Chạy `npm run build` kiểm tra không lỗi biên dịch.

## Todo List
- [x] Khởi tạo project Next.js + Prisma + SQLite
- [x] Schema + migration (`20260801162443_init_identity_vault`)
- [x] Module mã hóa AES-256-GCM + test
- [x] Module TOTP + test
- [x] Interface adapter antidetect + **cả hai** cài đặt (MultiZen và AdsPower)
- [x] UI: danh sách nick, chi tiết nick, personas, proxies, targets
- [x] API mở profile
- [ ] Nhập 11 nick thật vào hệ thống — **chờ Phase 00 mua xong nick/proxy**
- [x] Build sạch, không lỗi TypeScript

## Ghi chú triển khai (khác so với kế hoạch ban đầu)

1. **Prisma 7 bỏ `url` trong schema.prisma.** Connection URL chuyển sang `prisma.config.ts`,
   runtime bắt buộc dùng driver adapter (`@prisma/adapter-better-sqlite3`). Prisma 7 cũng
   không tự nạp `.env` nữa — dùng `process.loadEnvFile()` của Node 24.
2. **File DB nằm ở gốc project, không phải trong `prisma/`.** Driver adapter giải `file:./dev.db`
   theo CWD. `.gitignore` đã sửa cho khớp.
3. **otplib v13 khác hoàn toàn v12:** dùng class `TOTP` + plugin (`new NobleCryptoPlugin()`),
   `generate()` là async, và **`epoch` tính bằng giây chứ không phải mili-giây**.
   Đã kiểm chứng bằng vector chuẩn RFC 6238.
4. **Guardrail secret phải hạ xuống 10 byte.** otplib mặc định đòi >= 16 byte, nhưng Reddit và
   nhiều nền tảng phát secret 16 ký tự base32 = đúng 10 byte. Không hạ thì secret thật bị từ chối.
5. **Làm luôn cả 2 adapter** thay vì 1 như kế hoạch — AdsPower có tài liệu API đầy đủ nên viết
   nhanh, và nó là phương án dự phòng bắt buộc nếu Phase 00 kết luận MultiZen không nối được.
6. **Thêm ràng buộc `@unique` cho `antidetectProfileId`** (kế hoạch chỉ có cho `proxyId`).
   Hai nick chung một profile antidetect cũng nguy hiểm ngang chung IP.
7. **Adapter MultiZen chưa kiểm chứng bằng ứng dụng thật.** Tên tool và đường dẫn MCP suy ra từ
   tài liệu công khai. Nếu `launch` không trả về endpoint CDP, adapter ném lỗi kèm hướng dẫn
   chuyển sang AdsPower — đó chính là câu trả lời cho Phase 00.

## Kết quả kiểm thử

- `npm test` — 27/27 pass (4 file: crypto, totp, account-status, adapter-factory)
- `npm run typecheck` — sạch
- `npm run build` — thành công, 8 route
- `npx tsx scripts/smoke-test-identity-vault.ts` — 6/6 tiêu chí nghiệm thu đạt
- Dev server: cả 5 trang trả HTTP 200; API launch trả 404 đúng cho nick không tồn tại

## Success Criteria
- Mở được profile bất kỳ bằng 1 click, đúng IP (kiểm chứng bằng trang `whatismyipaddress.com` trong profile đó)
- Lấy được mã OTP đúng cho nick có 2FA
- Đọc file DB bằng trình xem SQLite → **không thấy mật khẩu dạng trần**
- Không tạo được 2 nick gắn cùng 1 proxy (DB chặn)

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Mất khóa mã hóa → mất toàn bộ credential | Sao lưu khóa ở password manager + 1 bản offline |
| Adapter antidetect đổi API sau update | Interface tách biệt, sửa 1 file |
| Nhập tay 11 nick dễ sai | Xác thực dữ liệu ở form; test mở thử từng nick sau khi nhập |

## Security Considerations
- Khóa mã hóa: biến môi trường `VAULT_KEY` (32 byte hex), **không commit**, thêm `.env*` vào `.gitignore`.
- File `dev.db` thêm vào `.gitignore` — chứa dữ liệu nhạy cảm dù đã mã hóa.
- App chỉ nghe `127.0.0.1`, không mở ra mạng LAN.
- Mật khẩu hiển thị dạng ẩn, chỉ lộ khi bấm "Copy" (copy thẳng vào clipboard, không in ra màn hình).
- Ghi `AuditLog` mỗi lần mở profile / xem credential.

## Next Steps
→ [Phase 02 — Hàng đợi content + Bộ luật an toàn](phase-02-content-queue-and-safety-rules.md)
