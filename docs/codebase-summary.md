# Bản đồ mã nguồn

**Cập nhật:** 05/08/2026

Tài liệu dành cho người mới và AI agent định vị nhanh trong codebase — **code nằm ở đâu**.
Hệ thống chạy ở đâu và phụ thuộc gì thì xem [system-architecture.md](system-architecture.md);
quy ước viết code ở [code-standards.md](code-standards.md).
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
│   ├── facebook/               Kết nối Fanpage, trạng thái token, giải thích về Group
│   ├── health/                 Bảng sức khỏe nick, lịch sử dò, biểu đồ karma 30 ngày
│   ├── relay-devices/          Sổ đăng ký máy chạy cầu nối — cả team đọc, ADMIN đăng ký/thu hồi
│   └── api/
│       ├── accounts/[id]/launch/   API mở profile antidetect browser
│       ├── facebook/oauth/         start (sinh state + redirect) và callback (đổi token)
│       ├── health/run/             Dò lại một nick ngay (POST)
│       └── rules/preview/          Chạy thử bộ luật, trả verdict (POST)
├── components/
│   ├── ui/                     Khối UI dùng chung: form controls, page section
│   ├── queue/                  UI hàng đợi: composer, bảng job, verdict badge, nút đăng Page,
│   │                           nhắc việc đăng tay (Reddit + Group)
│   ├── facebook/               Bảng Page: gán nick quản trị, kiểm token, ngắt kết nối
│   ├── health/                 Bảng sức khỏe, nút dò lại, biểu đồ karma, quản lý proxy quan sát viên
│   ├── relay/                  Nút thu hồi máy cầu nối (hỏi lại trước khi gạch tên)
│   └── content/                Form nhập content
└── lib/
    ├── accounts/               Server actions + quy tắc trạng thái nick
    ├── actions/                Kiểu ActionResult dùng chung cho mọi server action
    ├── antidetect/             Adapter MultiZen / AdsPower (đổi bằng 1 dòng .env)
    ├── auth/                   Đăng nhập Google, danh sách email cho phép, gác lối vào, hai vai trò
    ├── content/                Hằng số loại content, trạng thái job, loại tương tác
    ├── crypto/                 AES-256-GCM cho credential — hai vùng khóa (server / operator),
    │                           registry khai vùng cho từng cột, key loader
    ├── db/                     Prisma client singleton, sao lưu, chặn xóa khi còn tham chiếu
    ├── facebook/               Graph API: OAuth, token, đăng Fanpage (chi tiết bên dưới)
    ├── format/                 Định dạng ngày tiếng Việt
    ├── health/                 Bộ dò shadowban: phiên trình duyệt sạch qua proxy quan sát viên,
    │                           parser HTML Reddit, đánh giá kết luận, runner, khóa chống chạy chồng,
    │                           và tự gán link cho job từ bài thấy được trên profile
    ├── http/                   Đối chiếu Origin/Host cho route handler trong api/
    ├── platforms/              Gộp họ nền tảng (REDDIT / FACEBOOK)
    ├── proxies/                Kiểm proxy sống, báo cáo băng thông
    ├── queue/                  Server actions: tạo job, đổi trạng thái, ghi tương tác, tóm tắt promo
    ├── rules/                  Bộ luật an toàn — mỗi luật một file (chi tiết bên dưới)
    ├── tickets/                Đang xây (GĐ3) — khóa ký vé Ed25519 của máy chủ, khóa X25519 của
    │                           máy chạy cầu nối, server action đăng ký/thu hồi máy.
    │                           Bộ dựng/ký/mã hóa vé chưa có
    └── totp/                   Sinh mã OTP 2FA
```

Thư mục khác ở gốc repo:

```
prisma/
├── schema.prisma               Schema duy nhất, 18 model (thêm 4 model đăng nhập + `RelayDevice`)
└── migrations/                 Lịch sử migration
scripts/
├── generate-vault-key.ts       Sinh khóa kho (dùng cho cả hai vùng)
├── generate-server-signing-key.ts  Sinh cặp khóa ký vé Ed25519 MỚI cho máy chủ
├── show-server-public-key.ts   In khóa công khai của khóa ký đang dùng
├── generate-relay-device-key.ts  Sinh cặp khóa X25519 cho MỘT máy cầu nối — chạy trên chính máy đó
├── generate-test-totp-secret.ts  Sinh TOTP secret dùng thử
├── rekey-vault-key.ts          Xoay khóa MỘT vùng, mã hóa lại credential của vùng đó
├── backup-database.ts          Sao lưu bằng pg_dump (chạy được khi app đang mở)
├── upgrade-database.ts         Nâng cấp sau khi nhận bản mới: sao lưu rồi `migrate deploy`
├── import-proxies-from-provider-list.ts  Nhập hàng loạt proxy từ file nhà cung cấp
├── run-health-check.ts         Dò shadowban + đọc karma mọi nick Reddit (Phase 03)
├── smoke-test-identity-vault.ts  Kiểm chứng Phase 01
├── smoke-test-content-rules.ts   Kiểm chứng Phase 02
├── smoke-test-account-health.ts  Kiểm chứng Phase 03 (có phần đọc HTML Reddit thật)
└── smoke-test-facebook-pages.ts  Kiểm chứng Phase 04 (không cần Meta App)
plans/                          Kế hoạch triển khai (chỉ đọc, không sửa)
docs/                           Tài liệu dự án
```

---

## Mô hình dữ liệu

13 model trong `prisma/schema.prisma`. Các ràng buộc `@unique` là chỗ nguyên tắc 1:1 được ép.

| Model | Ý nghĩa | Ràng buộc đáng chú ý |
|---|---|---|
| `Persona` | Nhân vật: giọng điệu + mảng nội dung | `name @unique` |
| `Proxy` | Proxy tĩnh gắn 1:1 với nick | `label @unique`; `@@unique([host, port, username])`; `type` = cách mua (STATIC_ISP/MOBILE), `protocol` = giao thức mạng (http/socks5) — hai thứ khác nhau |
| `ObserverProxy` | Proxy dò shadowban, KHÔNG được dùng đăng nhập | `label @unique`. Tách hẳn khỏi `Proxy` chứ không thêm cờ: bản ghi nằm ở bảng này thì **không có đường nào** gắn vào nick |
| `HealthCheck` | Một lần dò sức khỏe nick từ góc nhìn người ngoài | Giữ cả `visiblePosts` lẫn `expectedPosts`, không chỉ giữ kết luận — khi Reddit đổi HTML thì hai số này là thứ duy nhất cho biết bộ dò sai từ lúc nào. Không parse được **phải** là `ERROR`, tuyệt đối không phải `HEALTHY` |
| `Account` | Nick Reddit/Facebook | `antidetectProfileId @unique` và `proxyId @unique` — ép 1 nick : 1 profile : 1 proxy. Cả hai **nullable**: bắt buộc với Reddit, bỏ trống được với Facebook (xem mục riêng bên dưới); `@@unique([platform, username])` |
| `PlatformTarget` | Đích đăng: sub/page/group kèm luật riêng | `@@unique([platform, name])` |
| `ContentItem` | Bài do team viết | `type`: VALUE hoặc PROMO |
| `PostJob` | Một lần đăng đã xếp lịch | `ruleVerdicts`: JSON kết quả luật tại lúc tạo; `overrideReason`: bắt buộc nếu ghi đè |
| `Interaction` | Nick chạm vào thread (post/comment/upvote) | `threadKey`: URL đã chuẩn hóa, khóa so đụng độ |
| `RuleConfig` | Ngưỡng luật, sửa bằng `db:studio` | `key @id` — mỗi ngưỡng một dòng |
| `AuditLog` | Nhật ký thao tác nhạy cảm | Ghi mọi lần: mở profile, xem credential, ghi đè luật, đăng Fanpage |
| `FacebookConnection` | Một lần OAuth với nick cá nhân — nguồn sinh mọi Page token | `fbUserId @unique`; `expiresAt` là hạn của user token, mọi Page dưới nó chết theo |
| `FacebookPage` | Một Fanpage đã kết nối | `pageId @unique`; `targetId @unique` ép 1 đích : 1 Page |

Quan hệ chính: `Account` → `Persona` (n:1), `Account` → `Proxy` (1:1), `PostJob` → `Account` + `PlatformTarget` + `ContentItem`, `Interaction` → `Account` + `PlatformTarget`, `FacebookPage` → `FacebookConnection` (n:1) + `PlatformTarget` (1:1).

**Không có model nào cho việc tự đăng Facebook Group, và sẽ không có** — Meta gỡ
`publish_to_groups` từ 04/2024. Bài group là `PostJob` với đích FACEBOOK_GROUP như mọi bài khác,
nên vẫn bị chấm 9 trong 10 luật; phần nhắc việc là một truy vấn
(`queue/manual-post-reminders.ts`), không phải một bảng.

Bộ nhắc việc đó **dùng chung cho Reddit và Group** — hai đường đăng tay giống nhau tới từng bước.
Danh sách "đích nào phải đăng tay" được **suy ra** trong `platform-family.ts`
(`MANUAL_POST_PLATFORMS` = mọi đích trừ `AUTO_PUBLISH_PLATFORMS`), nên thêm một loại đích mới mà
chưa viết bộ đăng tự động thì nó mặc định rơi vào "đăng tay" — hiện ra ở nhắc việc thay vì im lặng
biến mất. Khác biệt duy nhất giữa hai nền tảng là số ô nhập: Reddit hai ô (tiêu đề rời), Facebook một.

---

## Luồng chính: từ nhập content đến ghi tương tác

```
1. Nhập content         → src/lib/content/content-item-actions.ts  → ContentItem
2. Xếp lịch (composer)  → src/components/queue/post-job-composer.tsx
   (đích Fanpage không phải nhập tay: kết nối ở /facebook là tự sinh PlatformTarget)
   ├── Chọn nick + đích → gọi API /api/rules/preview (POST)
   │                     → src/lib/rules/rule-context-builder.ts   xây RuleContext
   │                     → src/lib/rules/rules-engine.ts           chạy luật áp cho nền tảng đó
   │                     → trả verdict về UI realtime
   └── Bấm lưu          → src/lib/queue/post-job-actions.ts       → PostJob (PENDING|BLOCKED)
3. Đăng bài             → Fanpage: nút "Đăng lên Page" gọi Graph API (Phase 04)
                          Reddit/Group: thẻ "Đăng tay" ở trang tổng quan
                          → src/lib/queue/manual-post-reminders.ts   job đến hạn trong 24h
                          → src/components/queue/manual-post-reminders.tsx
                            mở profile + copy sẵn nội dung; dán và bấm đăng là việc của người
                            (tự đăng Reddit → Phase 05)
4. Đánh dấu đã đăng     → src/lib/queue/post-job-mark-posted.ts    → status = POSTED + Interaction
                          (lõi dùng chung cho cả 3 đường ghi: bấm tay, Graph API, bộ dò tự gán)
                          ├── bấm tay      → src/lib/queue/post-job-status-actions.ts
                          ├── bộ dò tự gán → src/lib/health/auto-link-discovered-posts.ts
                          └── bấm nhầm     → src/lib/queue/post-job-revert.ts: gỡ status + link
                                             + Interaction đã ghi, rồi chấm lại luật
5. Ghi tương tác        → src/lib/queue/interaction-actions.ts     → Interaction
```

---

## Luồng mở profile antidetect

```
Bấm "Mở profile" → POST /api/accounts/[id]/launch
  1. Chặn theo trạng thái nick    → account-status.ts (canLaunch)
  2. Dựng cấu hình proxy          → antidetect/proxy-config-builder.ts (giải mã passwordEnc)
  3. ĐẨY proxy vào profile        → adapter.applyProxy()   ← hỏng thì DỪNG, không mở
  4. Mở profile                   → adapter.launchProfile()
  5. Ghi AuditLog PROFILE_LAUNCHED kèm nhãn proxy + giao thức
```

Thứ tự 3 trước 4 là bắt buộc: đổi proxy sau khi profile đã mở thì phiên đang chạy vẫn đi bằng
IP cũ. Đẩy thất bại mà vẫn mở là mở bằng IP nhà — nên mọi đường thất bại ở bước 2/3 đều chặn hẳn.

| Provider | Đẩy proxy bằng |
|---|---|
| MultiZen | tool MCP `update_profile`, field `proxy: { type: http\|socks5, host, port, username?, password? }` |
| AdsPower | `POST /api/v1/user/update` với `user_proxy_config.proxy_soft = "other"`; adapter tự giãn 1,1s/lời gọi cho khỏi vượt hạn mức 1 req/s |

Mật khẩu proxy dạng trần chỉ tồn tại trong `proxy-config-builder.ts` và lời gọi adapter. Thông
báo lỗi của cả hai adapter đều che mật khẩu trước khi trả về — API của provider hay vọng lại
nguyên tham số đã gửi.

---

## Luồng Facebook Pages

```
Kết nối (một lần cho mỗi nick quản trị Page)
  /facebook → GET /api/facebook/oauth/start      sinh state, cất cookie, đẩy sang Facebook
            → GET /api/facebook/oauth/callback   đối chiếu state
              1. code → user token 2 giờ         facebook-oauth-flow.exchangeCodeForToken
              2. → user token 60 ngày            exchangeForLongLivedToken   ← KHÔNG được bỏ
              3. → danh sách Page + Page token    fetchManagedPages
              4. lưu (mã hóa) + tự tạo đích đăng  facebook-token-manager.saveConnectionWithPages

Đăng bài
  /queue → nút "Đăng lên Page"  → facebook-publish-action.publishJobToPage
              1. chặn nếu đích không phải Fanpage / job không PENDING / chưa nối Page
              2. facebook-page-publisher.publishToPage
                 - chấm token trước (evaluateTokenHealth), hỏng thì DỪNG, không gọi mạng
                 - dựng tham số (facebook-post-payload) → POST {pageId}/feed hoặc /photos
                 - Facebook từ chối token → ghi tokenValid=false ngay
              3. markJobPosted() — dùng lại đường của hàng đợi, ghi luôn Interaction
```

Bước 2 của phần kết nối là chỗ dễ bỏ nhất và hỏng nặng nhất: Page token thừa hưởng tuổi thọ
của user token, dừng ở token 2 giờ thì trưa hôm sau công cụ ngừng đăng mà không rõ vì sao.

| File | Việc |
|---|---|
| `facebook-app-config.ts` | Đọc env, quyền cần xin, redirect URI, phiên bản Graph |
| `facebook-graph-client.ts` | GET/POST + `redactTokens()` che token trong mọi thông báo lỗi |
| `facebook-graph-error-messages.ts` | Dịch mã lỗi Graph sang câu hành động được (hàm thuần) |
| `facebook-oauth-flow.ts` | Authorize URL, đổi code → token, lấy Page |
| `facebook-token-manager.ts` | Lưu mã hóa, tự tạo `PlatformTarget`, kiểm token hàng loạt |
| `facebook-token-health.ts` | Chấm sức khỏe token: OK / WARN / EXPIRED / INVALID (hàm thuần) |
| `facebook-post-payload.ts` | Ghép nội dung + chọn `/feed` hay `/photos` (hàm thuần) |
| `facebook-page-publisher.ts` | Đăng thật, trả post id + URL |
| `facebook-page-actions.ts` | Server action: kiểm token, gán nick quản trị, ngắt kết nối |
| `facebook-publish-action.ts` | Đăng một job trong hàng đợi |

Bốn file `*-health`, `*-payload`, `*-error-messages`, và phần dựng URL là hàm thuần: test được
không cần token thật, không cần mạng, không cần database.

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
| `rule-health-check.ts` | Luật 10 (kết quả dò gần nhất) — chỉ áp cho Reddit |
| `content-similarity-calculator.ts` | Jaccard trên trigram ký tự |
| `text-normalizer.ts` | Chuẩn hóa văn bản trước khi so trùng |
| `rules-engine.ts` | Gom 10 luật, lọc theo nền tảng của đích, chạy tuần tự, mức nặng nhất thắng |

**Thêm luật mới** = thêm 1 file luật + 1 dòng trong mảng `RULES` ở `rules-engine.ts`.

### Luật theo nền tảng

Mỗi mục trong `RULES` khai được `platforms` — bỏ trống nghĩa là áp cho mọi nền tảng. Bốn luật
giữ nhịp (4 hạn mức ngày, 5 nghỉ 24h, 6 tỷ lệ promo, 8 đụng độ thread) chỉ áp cho
`COMMUNITY_PLATFORMS` = Reddit + Facebook Group, vì Fanpage là kênh của chính mình chứ không
phải cộng đồng mình vào nhờ. Luật 10 hẹp hơn nữa — chỉ Reddit, vì bộ dò chỉ đọc được profile
Reddit và Fanpage đăng hỏng thì Graph API báo lỗi ngay.

Số luật thực chạy: **Reddit 10 · Facebook Group 9 · Fanpage 5**.

Luật bị loại **trước khi chạy** và nêu tên trong `RuleEvaluation.skipped`, không lặng lẽ trả
ALLOW — checklist phải nói rõ nó chưa kiểm gì.

`interaction-actions.ts` gọi thẳng luật 8 chứ không qua engine, nên nó hỏi cùng nguồn sự thật
bằng `isCommunityPlatform()`. Hai đường lệch nhau là luật chặn ở chỗ này mà lọt ở chỗ kia.

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
| `npm run db:upgrade` | Nâng cấp database sau khi nhận bản mới — sao lưu rồi áp phần còn thiếu |
| `npm run db:migrate` | Tạo migration mới (`prisma migrate dev`) — chỉ dùng khi phát triển |
| `npm run db:studio` | Mở Prisma Studio xem/sửa database (nơi sửa ngưỡng `RuleConfig`) |
| `npm run db:backup` | Sao lưu database ra `data/backups/` |
| `npm run health` | Dò shadowban + đọc karma mọi nick Reddit (đặt lịch chạy hằng ngày) |
| `npm run vault:smoke` | Kiểm chứng nghiệm thu Phase 01 |
| `npm run rules:smoke` | Kiểm chứng nghiệm thu Phase 02 |
| `npm run health:smoke` | Kiểm chứng nghiệm thu Phase 03 (không cần nick, không cần proxy) |
| `npm run facebook:smoke` | Kiểm chứng nghiệm thu Phase 04 (không cần Meta App) |

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

4. **`prisma migrate dev` không phải lúc nào cũng sinh lại client.** Thêm model xong, migration
   áp thành công mà `tsc` vẫn báo `Property 'facebookPage' does not exist on type 'PrismaClient'`
   — chạy `npm run db:generate` là hết. Đừng đi sửa code theo lỗi đó.

5. **Đừng hỏi "database có tồn tại không" để biết đây có phải lần cài đầu.** Với Postgres thì
   database luôn tồn tại — người dùng phải `createdb` trước mới chạy nổi lệnh nào; hồi SQLite thì
   ngược lại, chỉ cần mở kết nối là file rỗng tự sinh ra. Hai nền dữ liệu, cùng một kết luận:
   `upgrade-database.ts` từng vì hỏi sai câu mà sao lưu một database trống trơn ở lần cài đầu —
   và bản sao lưu rỗng còn tệ hơn không có, vì nó làm người ta tưởng mình đang có bản dự phòng.
   Câu hỏi đúng là **"sổ migration đã có dòng nào chưa"**.

6. **Biến môi trường thắng `.env`.** `prisma.config.ts` gọi `process.loadEnvFile()`, và cả hàm đó
   lẫn cờ `--env-file` của Node đều KHÔNG ghi đè biến đã đặt sẵn. Nhờ vậy chạy thử lệnh database
   trên file nháp chỉ cần đặt `DATABASE_URL` trước lệnh, không phải sửa `.env`.

---

## Việc chưa làm

- Tự động đăng Reddit qua tool MCP → Phase 05.

## Proxy + profile antidetect: bắt buộc với Reddit, không với Facebook

`Account.proxyId` và `Account.antidetectProfileId` là nullable từ 03/08/2026. Trước đó cả hai bắt
buộc, nên muốn xếp lịch một bài Fanpage là phải đốt một proxy thật và bịa một id profile — trong
khi Graph API không cần cả hai.

Ba chỗ giữ cho việc nới này không nới quá tay:

| Chỗ | Việc |
|---|---|
| `@unique` trên cột nullable | Postgres cho nhiều NULL nhưng chỉ một giá trị thật (giống hệt SQLite trước đây), nên **1 nick = 1 proxy vẫn nguyên** cho Reddit |
| `validatePlatformIdentityFields()` ở `vault-form-schemas.ts` | Hàm thuần, nguồn sự thật DUY NHẤT cho luật "Reddit bắt buộc". Cả `createAccount` lẫn `updateAccount` gọi nó |
| Route `api/accounts/[id]/launch` | Thiếu proxy hoặc profile thì từ chối mở kèm lý do, không mở profile trần bằng IP nhà |

Hai cái bẫy đã vấp và đã có test canh:

1. **Prisma `update` coi `undefined` là "giữ nguyên"**, không phải "xóa". Truyền thẳng ô form để
   trống xuống thì gỡ proxy sẽ im lặng không có tác dụng, mà giao diện vẫn báo "đã lưu". Phải ép
   về `null`.
2. **Chuỗi rỗng không phải NULL.** `@unique` coi hai chuỗi rỗng là trùng nhau, nên nick Facebook
   thứ hai sẽ ăn lỗi trùng ràng buộc mà không hiểu vì sao.

`accountUpdateSchema` không có `platform` (nền tảng cố định sau khi tạo nên form không gửi lên) —
`updateAccount` phải đọc nền tảng từ DB rồi mới chấm. Quên bước đó là đường sửa lỏng hơn đường tạo.

## Đã gọi Graph API thật — 03/08/2026

Phase 04 nghiệm thu xong bằng một bài đăng thật lên Fanpage nháp. Ba chi tiết đáng ghi:

1. **Đổi token 2 giờ → 60 ngày chạy đúng.** `FacebookConnection.expiresAt` về đúng mốc 60 ngày.
   Đây là bước tài liệu này vẫn cảnh báo là dễ bỏ nhất — nó không bị bỏ.
2. **Meta App loại Business tạo từ 2025 chỉ thêm được "Facebook Login for Business"**, mà bản đó
   khai quyền bằng `config_id` chứ không bằng `scope`. Đã thêm `FACEBOOK_LOGIN_CONFIG_ID` — có thì
   gửi `config_id` và bỏ `scope`, không có thì giữ đường cũ. Xem `buildAuthorizeUrl()`.
3. **Smoke test đi vòng qua chỗ người thật vấp.** `smoke-test-facebook-pages.ts` tạo `Account` bằng
   `prisma.account.create()` với `antidetectProfileId` giả và một proxy gán đại, nên nó không bao
   giờ chạm vào ràng buộc mà người dùng chạm ngay ở bước đầu. Bài học chung: smoke test tự dựng dữ
   liệu đầu vào thì không nghiệm thu được đường nhập liệu.

---

## Câu hỏi chưa có lời giải

- Ngưỡng luật hiện lấy theo kinh nghiệm chung, chưa có số liệu thật từ đàn nick này —
  xem [domain-glossary](domain-glossary.md#câu-hỏi-chưa-có-lời-giải).
- Bộ dò đã chạy thật (proxy quan sát viên `observer-1` bật từ 03/08/2026), nhưng số lượt còn quá
  ít để biết ngưỡng nào đúng: cửa sổ ghép 24 tiếng và ngưỡng slug 0.6 / 0.2 đều đang là phán
  đoán, chưa phải số đo. Đo vài tuần xem ca "mơ hồ, không dám gán" có thường xuyên tới mức đáng
  làm bảng chờ xác nhận không.

> **`playwright` giờ đã được dùng thật**, không còn là dependency treo: `observer-browser-session.ts`
> và `smoke-test-account-health.ts` import `chromium` để dò shadowban **trực tiếp, không qua
> antidetect browser** — đó là truy cập ẩn danh công khai, không cần giả vân tay. Máy mới phải chạy
> `npx playwright install chromium` một lần.

> **Tailwind CSS đang được dùng ở khắp nơi, đừng gỡ.** `globals.css` ngắn (16 dòng) là đúng
> thiết kế của Tailwind v4: một dòng `@import "tailwindcss"` kéo toàn bộ vào, phần còn lại là
> `@apply` cho `body`. Mọi component đều dùng utility class (`rounded-md`, `border`, `text-sm`…).
> Gỡ `tailwindcss` hoặc `@tailwindcss/postcss` là vỡ toàn bộ giao diện.
