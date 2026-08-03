# Audit MKTTool — bàn giao cho team dùng thử

**Ngày:** 03/08/2026 · **Nhánh:** master @ `83dcca0` · **Người audit:** rà soát inline toàn bộ codebase
**Phạm vi:** chức năng, nghiệp vụ, use case, mức độ sẵn sàng cho team dùng thử

> **Cập nhật 06:45 cùng ngày:** mọi phát hiện F1–F3 ở §6 **đã sửa xong** và kiểm chứng lại.
> Lint giờ sạch tuyệt đối (0 lỗi, 0 cảnh báo). Chi tiết ở §6.

---

## 1. Kết luận

**Dùng thử được — nhưng là "mỗi người một bản cài", không phải một bản dùng chung.**

Toàn bộ kiểm chứng tự động đều xanh. Bốn Phase (01–04) chạy thật, không phải mock. Nhưng có
**hai điều team phải biết trước khi động vào**, nếu không sẽ hiểu sai bản chất công cụ:

| # | Điều phải biết | Vì sao quan trọng |
|---|---|---|
| **A** | **Không có đăng nhập, app chỉ nghe `127.0.0.1`** | Không share được qua mạng LAN/internet. Mỗi người cài riêng, DB riêng, `VAULT_KEY` riêng. Dữ liệu **không** đồng bộ giữa các máy. |
| **B** | **Không có bộ đặt lịch tự động** | "Xếp lịch" = ghi giờ dự kiến + chấm luật. **Đến giờ bài KHÔNG tự lên.** Fanpage phải bấm nút; Reddit và Group phải đăng tay. |

Cả hai đều là **chủ ý thiết kế** (có ghi trong README), không phải lỗi. Nhưng cả hai đều là chỗ
người mới hiểu ngược, nên phải nói trước.

> Tài liệu sản phẩm (`docs/project-overview-pdr.md`) ghi rõ đối tượng là **1 MKT specialist** vận
> hành toàn bộ. Kiến trúc hiện tại đúng với thiết kế đó. "Team cùng dùng một kho danh tính" là
> bài toán khác, chưa có trong phạm vi.

---

## 2. Bằng chứng — đã chạy lại toàn bộ, không đọc chay

| Kiểm chứng | Lệnh | Kết quả |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ sạch, 0 lỗi |
| ESLint | `npm run lint` | ✅ **0 lỗi, 0 cảnh báo** (sau khi sửa — xem §6) |
| Unit test | `npm test` | ✅ **336/336 pass**, 31 file, 14.0s |
| Build production | `npm run build` | ✅ exit 0, 21 route |
| Phase 01 — Kho danh tính | `npm run vault:smoke` | ✅ **10/10** |
| Phase 02 — Bộ luật | `npm run rules:smoke` | ✅ **6/6**, bộ luật chạy 3ms |
| Phase 04 — Facebook Pages | `npm run facebook:smoke` | ✅ **11/11** |
| Phase 03 — Dò shadowban | `npm run health:smoke` | ✅ **17/17**, có phần đọc HTML Reddit thật |

Đáng chú ý: `health:smoke` **thật sự gọi ra Reddit** (đọc profile `u/spez`, đọc được karma
940.312, phân biệt đúng HTTP 200 / 404). Đây không phải fixture — nghĩa là khi Reddit đổi HTML
thì smoke test này đỏ, đúng thứ ta cần.

Không tìm thấy `TODO` / `FIXME` / code giả lập nào trong `src/` và `scripts/`.

---

## 3. Bản đồ chức năng

### 3.1 Giao diện — 12 trang + 4 API route

| Trang | Việc làm được |
|---|---|
| `/` | Dashboard: tổng quan nick, job sắp tới, sức khỏe, nhắc việc đăng Group |
| `/personas` · `/personas/[id]` | Nhân vật: giọng điệu + mảng nội dung. CRUD đầy đủ |
| `/proxies` · `/proxies/[id]` | Proxy tĩnh (gắn nick) + **proxy quan sát viên** (chỉ để dò). CRUD |
| `/accounts` · `/accounts/[id]` | Kho nick: credential mã hóa, copy mật khẩu, **sinh mã OTP**, mở profile antidetect, đổi trạng thái/gỡ cách ly |
| `/targets` · `/targets/[id]` | Đích đăng: subreddit / Fanpage / Group + ngưỡng riêng từng đích |
| `/content` · `/content/[id]` | Kho content team viết, phân loại VALUE / PROMO |
| `/queue` | Hàng đợi: xem verdict, đánh dấu đã đăng, **ghi tương tác thủ công**, nút đăng Fanpage, bảng tỷ lệ promo |
| `/queue/new` | Xếp lịch — **chấm luật realtime** ngay lúc chọn nick/đích, không đợi bấm lưu |
| `/facebook` | Kết nối Fanpage qua OAuth, kiểm token, gán nick admin, ngắt kết nối |
| `/health` | Bảng sức khỏe nick, lịch sử dò, biểu đồ karma 30 ngày, nút dò lại 1 nick |

| API route | Việc |
|---|---|
| `POST /api/accounts/[id]/launch` | Đẩy proxy vào profile rồi mở antidetect browser |
| `GET /api/facebook/oauth/start` + `/callback` | Luồng OAuth Facebook |
| `POST /api/health/run` | Dò lại 1 nick ngay |
| `POST /api/rules/preview` | Chấm thử bộ luật, trả verdict |

Cả 4 route POST đều qua `isSameOrigin()` — chặn trang web khác bắn lệnh vào localhost. Đây là
lớp bù cho việc không có đăng nhập, và nó **cần thiết** vì Next chỉ tự bảo vệ server action chứ
không bảo vệ route handler.

### 3.2 Lệnh dòng lệnh — 16 script

Vận hành: `dev` `build` `start` · Kiểm tra: `test` `lint` `typecheck`
Database: `db:migrate` `db:generate` `db:studio` `db:backup`
Kho khóa: `vault:keygen` `vault:rekey` `vault:testotp`
Nghiệp vụ: `proxies:import` `health`
Nghiệm thu: `vault:smoke` `rules:smoke` `facebook:smoke` `health:smoke`

### 3.3 Dữ liệu — 13 model

`Persona` `Proxy` `ObserverProxy` `Account` `PlatformTarget` `ContentItem` `PostJob`
`Interaction` `HealthCheck` `RuleConfig` `FacebookConnection` `FacebookPage` `AuditLog`

Ràng buộc do **database ép**, không phải do người dùng nhớ:
- `Account.proxyId @unique` → hai nick không dùng chung một proxy
- `Account.antidetectProfileId @unique` → hai nick không dùng chung một vân tay
- `ObserverProxy` là **bảng tách hẳn** khỏi `Proxy` → không có đường nào gắn proxy quan sát viên
  vào một nick, kể cả cố tình
- `FacebookPage.targetId @unique` → 1 đích : 1 Page

---

## 4. Nghiệp vụ — bộ luật an toàn

10 luật, chạy **tuần tự hết** (không dừng ở luật chặn đầu tiên — để sửa một lượt), mức nặng nhất thắng.

| # | Luật | Chặn khi | Áp cho | Ghi đè |
|---|---|---|---|---|
| 1 | Sức khỏe nick | trạng thái ≠ `ALIVE` | mọi nền tảng | có |
| 2 | Cold start | còn trong cold-start | mọi nền tảng | có |
| 3 | Điều kiện đích | thiếu karma / nick chưa đủ tuổi | mọi nền tảng | có |
| 4 | Hạn mức ngày | đã 2 bài/ngày | cộng đồng | có |
| 5 | Nghỉ giữa 2 bài | 2 bài cùng sub < 24h | cộng đồng | có |
| 6 | Tỷ lệ promo | chưa đủ 9 bài hữu ích | cộng đồng | có |
| 7 | Trùng nội dung | Jaccard ≥ 70% trong 30 ngày | mọi nền tảng | có |
| 8 | Đụng độ thread | nick khác đã chạm thread đó | cộng đồng | **KHÔNG** |
| 9 | Chính sách link | sub cấm link mà bài có link | mọi nền tảng | có |
| 10 | Kết quả dò gần nhất | lần dò cuối nói nick bị ẩn | Reddit | có |

**Ba điểm thiết kế đáng ghi nhận** (đã đọc code xác nhận, không phải chỉ đọc README):

1. **Luật bị bỏ qua không im lặng.** `rules-engine.ts` tách `skipped[]` riêng và UI hiện
   "Không áp dụng cho nền tảng này: …". Trả `ALLOW` ngầm cho luật không áp dụng là lỗ hổng im
   lặng — code cố tình tránh.
2. **Server chấm lại, không tin client.** `createPostJob()` chạy lại toàn bộ bộ luật ở server
   dù trình duyệt đã gửi kèm verdict xem trước. Dữ liệu có thể đổi giữa lúc xem và lúc lưu.
3. **Luật 8 trung thực về mức độ nó kiểm được.** Lúc xếp lịch chưa có thread để so nên luật chỉ
   *cảnh báo* và nhãn ghi đúng "nick khác cùng đích"; nhánh **CHẶN** nằm ở form ghi tương tác,
   nơi mới có link thread thật. Không ghi "Đụng độ thread ✓" để khỏi ai tưởng đã kiểm.

**Ngưỡng chỉnh được không cần sửa code**: bảng `RuleConfig` (`npm run db:studio`). Key lạ hoặc
giá trị hỏng thì rơi về mặc định — mặc định vốn chặt hơn, nên cấu hình hỏng không nới lỏng an toàn.
Hiện `RuleConfig` **rỗng** → đang chạy toàn bộ mặc định.

---

## 5. Đã kiểm chứng vs chưa

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Mã hóa credential, ràng buộc 1:1, OTP | ✅ | `vault:smoke` 10/10 |
| Bộ luật chấm đúng, chặn đúng | ✅ | `rules:smoke` 6/6 |
| Mở profile antidetect | ✅ 02/08 | Chặng B |
| Đẩy proxy vào profile, IP khớp | ✅ 02/08 | Chặng C |
| Dò shadowban đọc Reddit thật | ✅ 03/08 | `health:smoke` 17/17 |
| **Đăng thật lên Fanpage** | ✅ 03/08 | `AuditLog` có `FACEBOOK_PAGE_PUBLISHED` |
| Đăng bằng nick Reddit thật | ❌ **chưa** | Phase 05 chưa làm — không có tính năng |
| `npm run health` với nick thật | ❌ **chưa** | `ObserverProxy` đang rỗng (0 dòng) |
| Nhiều người dùng đồng thời | ❌ **không hỗ trợ** | Không có auth, không có đồng bộ |

---

## 6. Phát hiện — F1–F3 đã sửa xong

Không có lỗi chặn đường. Ba nhóm đầu đã sửa và kiểm chứng lại; F4 là ghi chú vận hành.

**F1 — Tài liệu lệch thực tế (trung bình) → ✅ ĐÃ SỬA**

| Chỗ lệch | Đã sửa thành |
|---|---|
| PDR ghi *"Phase 01 + 02 xong, Phase 00 đang chạy"* | Phase 01–04 xong, kèm ghi chú Phase 03 chưa chạy với nick thật |
| PDR quyết định #6 *"không dùng Playwright"* | Tách rõ: **trình duyệt của nick** đi qua MultiZen MCP, **bộ dò shadowban** dùng Playwright trực tiếp — hai việc trái ngược nên đi hai đường |
| `codebase-summary` ghi *"12 model"* | **13**, thêm hẳn dòng `HealthCheck` |
| `codebase-summary` thiếu `lib/health/`, `lib/http/`, `lib/actions/`, `app/health/`, `api/health/run/`, `components/health/` | Đã bổ sung vào cây thư mục |
| `codebase-summary` thiếu 5 script | Thêm `run-health-check`, `smoke-test-account-health`, `rekey-vault-key`, `backup-database`, `import-proxies…` |
| `codebase-summary` ghi *"playwright chưa file nào import"* | Sai từ Phase 03 — nay đã dùng thật ở `observer-browser-session.ts`. Đã sửa kèm nhắc `npx playwright install chromium` |
| `domain-glossary` thiếu hẳn **luật 10** | Thêm dòng luật 10 vào bảng + mục mới **"Dò shadowban — 6 kết luận"** (`HEALTHY`/`SHADOWBANNED`/`CHECKPOINT`/`WARN`/`ERROR`/`NO_BASELINE`) |

**F2 — Sai số luật trong code và tài liệu (thấp) → ✅ ĐÃ SỬA**

Không chỉ một chỗ như báo cáo ban đầu ghi, mà **bảy** chỗ, và có một chỗ sai tinh vi hơn:

- `rules-engine.ts`, `rule-context-builder.ts`, `smoke-test-content-rules.ts`: *"9 luật"* → **10**.
- **Sai tinh vi:** README, `facebook/page.tsx`, `facebook-group-reminder.ts` và `domain-glossary`
  đều ghi bài Group được chấm *"đủ 9 luật **như Reddit**"*. Con số 9 đúng cho Group, nhưng
  **Reddit là 10** — câu đó khiến người đọc tưởng hai nền tảng được kiểm như nhau. Đã sửa thành
  *"9 trong 10 luật — trừ luật dò shadowban vốn chỉ áp cho Reddit"*.
- Số luật thực chạy nay được ghi rõ ở cả 3 tài liệu: **Reddit 10 · Facebook Group 9 · Fanpage 5**.
  Đã **kiểm chứng sống trên trình duyệt**: đích Group hiện "7/9 luật qua", đích Fanpage hiện
  "4/5 luật qua" với đúng 5 luật nằm trong danh sách bỏ qua.

**F3 — Cảnh báo ESLint (thấp) → ✅ ĐÃ SỬA, lint nay sạch tuyệt đối**

Báo cáo đầu ghi 3 cảnh báo ở 2 file; thực tế là 3 file — file thứ ba bị cắt mất khi đọc log.

| File | Cách xử lý |
|---|---|
| `use-rule-preview.ts` | **Sửa thật.** "Chưa chọn đủ" và "đang chạy" nay *suy ra* từ lựa chọn thay vì lưu thành state; kết quả mang theo khóa của lựa chọn sinh ra nó. Bớt một lượt render mỗi lần đổi lựa chọn, và khóa thành lớp chặn thứ hai cho phản hồi lạc |
| `account-vault-actions-panel.ts` | **Sửa thật.** Chính lượt đếm ngược cuối xóa mã OTP, thay vì một effect chạy sau nhìn thấy số 0 rồi mới dọn — bỏ được lượt render mang mã đã hết hạn ra màn hình |
| `post-job-composer.tsx` | **Tắt luật tại đúng dòng, kèm giải thích.** Giá trị "giờ mặc định" CHỈ tính được ở client (phụ thuộc múi giờ máy), không có cách nào suy ra lúc render mà vẫn hydrate sạch. Đây là ngoại lệ chính đáng, không phải né linter |

**F4 — DB của máy dev còn dữ liệu thử (thấp, không rò rỉ)**
- `dev.db` hiện có 2 nick (`test-01`, `anh-hao-fb`), 10 proxy, 1 kết nối Facebook, 1 Page.
- **Không rò ra ngoài**: `*.db` và `.env` đều nằm trong `.gitignore` (đã xác nhận). Team clone về
  sẽ có DB rỗng.
- Chỉ cần lưu ý khi ai đó copy nguyên thư mục thay vì clone.

**Không phải lỗi — smoke test tự dọn.** Các script smoke đều xóa theo prefix riêng ở đầu và cuối
lượt, nên chạy trên DB thật không để lại rác. Đã xác nhận trong code.

---

## 7. Hướng dẫn team dùng thử

### 7.1 Cài (mỗi người tự làm trên máy mình, ~10 phút)

```bash
npm install
cp .env.example .env
npm run vault:keygen
```

Dán khóa vừa sinh vào `VAULT_KEY` trong `.env`, rồi:

```bash
npm run db:migrate
npm run dev
```

Mở **`http://localhost:3000`** — phải đúng `localhost`, **không** phải `127.0.0.1`
(cookie chống CSRF của luồng Facebook gắn theo host).

> **`VAULT_KEY` sao lưu vào password manager ngay.** Mất khóa = mất toàn bộ mật khẩu và TOTP của
> mọi nick, không có đường khôi phục.

### 7.2 Chặng A — kiểm chứng công cụ (không cần nick, proxy, hay Meta App)

```bash
npm run vault:smoke && npm run rules:smoke && npm run facebook:smoke && npm run health:smoke
```

Bốn lệnh phải xanh hết. Xong thì nhập dữ liệu giả qua UI theo đúng thứ tự:

1. Nhân vật (`/personas`) → 2. Proxy (`/proxies`) → 3. Nick (`/accounts`) →
4. Đích (`/targets`) → 5. Content (`/content`) → 6. Xếp lịch (`/queue/new`)

**Kịch bản đáng thử nhất** — cho team thấy giá trị thật của công cụ:

| Thử | Kỳ vọng |
|---|---|
| Xếp 1 bài cho nick vừa tạo | **CHẶN** — nick đang `COLD_START` |
| Đổi nick sang "Khỏe", xếp lại | **CHẶN** tiếp — luật 10 chưa có lần dò nào |
| Xếp 3 bài cùng nick cùng ngày | Bài thứ 3 **CHẶN** — hạn mức ngày |
| Copy y nguyên 1 bài sang nick khác | **CHẶN** — trùng nội dung ≥70% |
| Xếp bài PROMO khi mới có ít bài VALUE | **CHẶN**, nói rõ còn thiếu mấy bài |
| Ghi tương tác cho nick B vào thread nick A đã chạm | **CHẶN, không ghi đè được** |
| Thử xóa nick đang có job | **CHẶN**, nói rõ vướng gì |
| Bấm copy mật khẩu, bấm sinh OTP | Vào clipboard; đối chiếu OTP bằng `npm run vault:testotp` |

### 7.3 Chặng B/C — cần MultiZen (miễn phí) và 1 proxy bất kỳ

Cài MultiZen → lấy bearer token ở `MCP → Connect an agent` → dán vào `MULTIZEN_MCP_TOKEN`.
Nhập proxy ở `/proxies`, gắn cho nick, bấm **"Mở profile"** → vào `ipinfo.io` → IP phải khớp proxy.

Nếu dò shadowban: cần thêm `npx playwright install chromium` và **một proxy quan sát viên
riêng biệt** (`/proxies`, khối riêng) — proxy HTTP, chưa từng đăng nhập nick nào.

### 7.4 Chặng D — nick thật

Chỉ làm sau khi A/B/C xong. **Đừng dùng proxy test cho nick thật.**

---

## 8. Việc nên làm trước khi bàn giao rộng

| Ưu tiên | Việc | Trạng thái |
|---|---|---|
| Cao | Cập nhật PDR + `codebase-summary` + `domain-glossary` (F1) | ✅ xong |
| Cao | **Nói rõ với team hai điều ở §1**: không share được, không tự đăng | ⬜ việc của người bàn giao |
| Trung bình | Sửa số luật ở code lẫn tài liệu (F2) | ✅ xong |
| Thấp | Dọn cảnh báo lint (F3) | ✅ xong, lint sạch tuyệt đối |

**Kiểm chứng lại sau khi sửa — chạy đủ, không bỏ bước:**

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | ✅ 0 lỗi, **0 cảnh báo** |
| `npm run typecheck` | ✅ sạch |
| `npm test` | ✅ **336/336** |
| `npm run build` | ✅ exit 0 |
| 4 bộ smoke | ✅ 10/10 · 6/6 · 11/11 · 17/17 |
| Trang `/queue/new` trên trình duyệt thật | ✅ bộ luật chấm đúng, verdict đổi đúng khi đổi đích |

> Hook `use-rule-preview.ts` được refactor mà **không có unit test** phủ (dự án chạy
> `environment: node`, chưa có jsdom/testing-library). Vì vậy nó được kiểm chứng **trực tiếp trên
> trình duyệt** thay vì chỉ tin build xanh — đây là hook hiện verdict an toàn, hỏng ngầm chính là
> kiểu "đèn xanh sai" mà đầu file đó cảnh báo. Nếu sau này còn động vào nó, nên cân nhắc thêm
> jsdom + testing-library.

---

## 9. Câu hỏi chưa giải quyết

1. **"Gửi cho team dùng thử" nghĩa là gì?** Mỗi người một bản cài độc lập (kiến trúc hiện tại
   đáp ứng ngay), hay team dùng chung một kho danh tính? Nếu là vế sau thì cần thêm đăng nhập +
   phân quyền + đổi SQLite sang DB dùng chung — phạm vi lớn, chưa có trong kế hoạch nào.
2. **Ai giữ `VAULT_KEY`?** Mỗi người một khóa riêng thì dữ liệu không chuyển máy được. Dùng chung
   một khóa thì tiện chuyển nhưng lộ một máy là lộ hết.
3. **Phase 05 (tự đăng Reddit) có nằm trong đợt dùng thử này không?** Nếu team kỳ vọng thấy bài
   Reddit tự lên thì phải nói trước là chưa có.
4. **Proxy quan sát viên đã mua chưa?** Chưa có thì `npm run health` dừng ngay từ đầu, và toàn bộ
   luật 10 sẽ cảnh báo trên mọi job Reddit.
5. **Có thêm jsdom + testing-library không?** Hiện mọi component và hook React đều không có test
   tự động — 336 test đều là logic thuần và truy vấn database. Chưa cần gấp, nhưng mỗi lần sửa
   `use-rule-preview` hay `post-job-composer` đều phải mở trình duyệt kiểm tay.
