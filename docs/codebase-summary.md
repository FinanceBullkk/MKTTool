# Bản đồ mã nguồn

**Cập nhật:** 02/08/2026

Tài liệu dành cho người mới và AI agent định vị nhanh trong codebase.
Thuật ngữ tra ở [domain-glossary.md](domain-glossary.md). Cách cài và chạy xem [README](../README.md).

---

## Cây thư mục

```
src/
├── app/                        Next.js 16 App Router — trang và API route
│   ├── layout.tsx              Layout gốc, font, metadata
│   ├── page.tsx                Dashboard chính
│   ├── accounts/               Danh sách + chi tiết nick
│   ├── personas/               Quản lý nhân vật
│   ├── proxies/                Quản lý proxy
│   ├── targets/                Đích đăng (subreddit, Fanpage…)
│   ├── content/                Kho content team viết
│   ├── queue/                  Hàng đợi + trang xếp lịch (chấm luật realtime)
│   └── api/
│       ├── accounts/[id]/launch/   API mở profile antidetect browser
│       └── rules/preview/          Chạy thử bộ luật, trả verdict (POST)
├── components/
│   ├── ui/                     Khối UI dùng chung: form controls, page section
│   ├── queue/                  UI hàng đợi: composer, bảng job, verdict badge, form tương tác
│   └── content/                Form nhập content
└── lib/
    ├── accounts/               Server actions + quy tắc trạng thái nick
    ├── antidetect/             Adapter MultiZen / AdsPower (đổi bằng 1 dòng .env)
    ├── content/                Hằng số loại content, trạng thái job, loại tương tác
    ├── crypto/                 AES-256-GCM cho credential (mã hóa/giải mã + key loader)
    ├── db/                     Prisma client singleton
    ├── format/                 Định dạng ngày tiếng Việt
    ├── platforms/              Gộp họ nền tảng (REDDIT / FACEBOOK)
    ├── queue/                  Server actions: tạo job, đổi trạng thái, ghi tương tác, tóm tắt promo
    ├── rules/                  Bộ luật an toàn — mỗi luật một file (chi tiết bên dưới)
    └── totp/                   Sinh mã OTP 2FA
```

Thư mục khác ở gốc repo:

```
prisma/
├── schema.prisma               Schema duy nhất, 10 model
└── migrations/                 Lịch sử migration
scripts/
├── generate-vault-key.ts       Sinh VAULT_KEY
├── generate-test-totp-secret.ts  Sinh TOTP secret dùng thử
├── smoke-test-identity-vault.ts  Kiểm chứng Phase 01
└── smoke-test-content-rules.ts   Kiểm chứng Phase 02
plans/                          Kế hoạch triển khai (chỉ đọc, không sửa)
docs/                           Tài liệu dự án
```

---

## Mô hình dữ liệu

10 model trong `prisma/schema.prisma`. Các ràng buộc `@unique` là chỗ nguyên tắc 1:1 được ép.

| Model | Ý nghĩa | Ràng buộc đáng chú ý |
|---|---|---|
| `Persona` | Nhân vật: giọng điệu + mảng nội dung | `name @unique` |
| `Proxy` | Proxy tĩnh gắn 1:1 với nick | `label @unique`; `@@unique([host, port, username])` |
| `ObserverProxy` | Proxy dò shadowban, KHÔNG được dùng đăng nhập | `label @unique` |
| `Account` | Nick Reddit/Facebook | `antidetectProfileId @unique` — ép 1 nick : 1 profile; `proxyId @unique` — ép 1 nick : 1 proxy; `@@unique([platform, username])` |
| `PlatformTarget` | Đích đăng: sub/page/group kèm luật riêng | `@@unique([platform, name])` |
| `ContentItem` | Bài do team viết | `type`: VALUE hoặc PROMO |
| `PostJob` | Một lần đăng đã xếp lịch | `ruleVerdicts`: JSON kết quả luật tại lúc tạo; `overrideReason`: bắt buộc nếu ghi đè |
| `Interaction` | Nick chạm vào thread (post/comment/upvote) | `threadKey`: URL đã chuẩn hóa, khóa so đụng độ |
| `RuleConfig` | Ngưỡng luật, sửa bằng `db:studio` | `key @id` — mỗi ngưỡng một dòng |
| `AuditLog` | Nhật ký thao tác nhạy cảm | Ghi mọi lần: mở profile, xem credential, ghi đè luật |

Quan hệ chính: `Account` → `Persona` (n:1), `Account` → `Proxy` (1:1), `PostJob` → `Account` + `PlatformTarget` + `ContentItem`, `Interaction` → `Account` + `PlatformTarget`.

---

## Luồng chính: từ nhập content đến ghi tương tác

```
1. Nhập content         → src/lib/content/content-item-actions.ts  → ContentItem
2. Xếp lịch (composer)  → src/components/queue/post-job-composer.tsx
   ├── Chọn nick + đích → gọi API /api/rules/preview (POST)
   │                     → src/lib/rules/rule-context-builder.ts   xây RuleContext
   │                     → src/lib/rules/rules-engine.ts           chạy 9 luật
   │                     → trả verdict về UI realtime
   └── Bấm lưu          → src/lib/queue/post-job-actions.ts       → PostJob (PENDING|BLOCKED)
3. Đăng bài (Phase 05)  → chưa có — hiện người dùng mở profile tay rồi copy/paste
4. Đánh dấu đã đăng     → src/lib/queue/post-job-status-actions.ts  → status = POSTED
5. Ghi tương tác        → src/lib/queue/interaction-actions.ts     → Interaction
```

---

## Bộ luật hoạt động thế nào

Mỗi luật là **hàm thuần** `(ctx: RuleContext) => RuleVerdict`:
- Input: object `RuleContext` chứa tất cả dữ liệu đã truy vấn sẵn.
- Output: `ALLOW`, `WARN` + lý do, hoặc `BLOCK` + lý do.

Kiến trúc:

| File | Việc |
|---|---|
| `rule-context-queries.ts` | Truy vấn database — nơi DUY NHẤT trong bộ luật chạm DB |
| `rule-context-builder.ts` | Lắp `RuleContext` từ kết quả truy vấn |
| `rule-thresholds.ts` | Ngưỡng mặc định + hàm ghi đè từ bảng `RuleConfig` |
| `rule-types.ts` | Kiểu `RuleContext`, `RuleVerdict`, `RuleEvaluator` |
| `rule-account-health.ts` | Luật 1 (sức khỏe) + luật 2 (cold start) |
| `rule-target-eligibility.ts` | Luật 3 (điều kiện đích) |
| `rule-daily-cap.ts` | Luật 4 (hạn mức ngày) |
| `rule-target-cooldown.ts` | Luật 5 (nghỉ giữa 2 bài) |
| `rule-promo-ratio.ts` | Luật 6 (tỷ lệ promo) |
| `rule-content-similarity.ts` | Luật 7 (trùng nội dung) |
| `rule-thread-collision.ts` | Luật 8 (đụng độ thread) — `overridable: false` |
| `rule-link-policy.ts` | Luật 9 (chính sách link) |
| `content-similarity-calculator.ts` | Jaccard trên trigram ký tự |
| `text-normalizer.ts` | Chuẩn hóa văn bản trước khi so trùng |
| `rules-engine.ts` | Gom 9 luật, chạy tuần tự, mức nặng nhất thắng |

**Thêm luật mới** = thêm 1 file luật + 1 dòng trong mảng `RULES` ở `rules-engine.ts`.

---

## Quy ước code

- **Tên file:** kebab-case (`rule-promo-ratio.ts`, không `rulePromoRatio.ts`)
- **Độ dài file:** dưới 200 dòng
- **Comment:** giải thích *vì sao*, không giải thích *cái gì*
- **Chuỗi hiển thị:** tiếng Việt (label, hint, thông báo lỗi)
- **Alias path:** `@/` = `./src/` (khai trong `tsconfig.json` và `vitest.config.mts`)

---

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở localhost:3000 |
| `npm test` | Chạy unit test (vitest) |
| `npm run typecheck` | Kiểm tra TypeScript (`tsc --noEmit`) |
| `npm run build` | Build production |
| `npm run db:migrate` | Áp migration Prisma |
| `npm run db:studio` | Mở Prisma Studio xem/sửa database |
| `npm run vault:smoke` | Kiểm chứng nghiệm thu Phase 01 |
| `npm run rules:smoke` | Kiểm chứng nghiệm thu Phase 02 |

Chi tiết đầy đủ ở [README → Lệnh](../README.md#lệnh).

---

## Bẫy đã gặp

1. **Chạy `db:migrate` xong phải khởi động lại dev server.** Prisma client cũ còn trong bộ nhớ
   của Next.js hot-reload. Không restart thì trang lỗi `Cannot read properties of undefined`
   vì client vẫn dùng schema cũ.

2. **`vitest.config.mts` phải khai alias `@/` giống `tsconfig.json`.** Thiếu thì test import
   không phân giải được, lỗi `Cannot find module '@/lib/...'`.

3. **Script trong `scripts/` cần `tsx --env-file=.env`** vì `prisma-client.ts` đọc
   `DATABASE_URL` ngay lúc import. Quên `--env-file` thì lỗi `Thiếu DATABASE_URL`.

---

## Việc chưa làm

- **Proxy chưa được đẩy tự động sang antidetect browser** — hiện phải nhập tay ở cả hai nơi
  (MKTTool và MultiZen). `update_profile` của MultiZen nhận object proxy đầy đủ
  (`type`, `host`, `port`, `username`, `password`) nên sẽ tự động hóa được.
- **Chưa kiểm chứng IP trong profile khớp proxy** (Chặng C).
- Dò shadowban + theo dõi karma → Phase 03.
- Facebook Pages qua Graph API → Phase 04.
- Tự động đăng Reddit qua tool MCP → Phase 05.

---

## Câu hỏi chưa có lời giải

- `playwright` nằm trong `dependencies` nhưng **hiện chưa file nào import**. Đừng gỡ vội:
  [Phase 03](../plans/260801-2030-multi-account-posting-console/phase-03-account-health-monitor.md)
  dự định dùng Playwright **trực tiếp, không qua antidetect browser** để dò shadowban từ proxy
  quan sát viên — đó là truy cập ẩn danh công khai, không cần giả vân tay.
  *(Không phải do adapter AdsPower cần: adapter đó chỉ trả về một chuỗi URL endpoint.)*
- Ngưỡng luật hiện lấy theo kinh nghiệm chung, chưa có số liệu thật từ đàn nick này —
  xem [domain-glossary](domain-glossary.md#câu-hỏi-chưa-có-lời-giải).

> **Tailwind CSS đang được dùng ở khắp nơi, đừng gỡ.** `globals.css` ngắn (16 dòng) là đúng
> thiết kế của Tailwind v4: một dòng `@import "tailwindcss"` kéo toàn bộ vào, phần còn lại là
> `@apply` cho `body`. Mọi component đều dùng utility class (`rounded-md`, `border`, `text-sm`…).
> Gỡ `tailwindcss` hoặc `@tailwindcss/postcss` là vỡ toàn bộ giao diện.
