# MKTTool

MKTTool is the team's nick vault and posting-safety console. It manages browser-backed Reddit and
TikTok nicks plus Facebook Page identities, while keeping nick, proxy, browser profile, and Relay PC
ownership explicit. Browser profile and proxy controls are operational boundaries; they are not a
promise of unique or isolated browser identity.

**Product direction, 8 September 2026:** the owner accepted MKT Browser as a **browser profile
manager with proxy binding**. Priorities are Proxy vault, Relay handoff, and reliable manual profile
operations. Antidetect/identity-engine research and Lane C are closed. The Browser draft remains
limited to the profile/proxy product boundary. The **MKTTool Web shared-workspace surface is ready
for controlled internal team use**; Browser installer distribution is currently **HOLD**. The
historical Browser `0.3.17` / Relay `17` tuple was accepted. The prepared `0.3.24` / Relay `18`
candidate is not operator-promoted. Neither tuple establishes unique identity, identity isolation, or real-account
safety. See the [team-ready rollout guide](docs/team-ready-rollout.md), [product decision](docs/project-overview-pdr.md#product-direction-decision---8-september-2026),
and [release boundary](docs/internal-beta-release.md).

**Rollout scope decision, 2 September 2026:** Reddit and Facebook are **withdrawn from the team
rollout scope**. The code stays implemented, tested, and deployed — this is a scope decision, not a
removal — but no Reddit or Facebook workflow is handed to operators, and the posting surface is not
part of what the team is asked to use. What remains in scope for the team is the shared nick vault,
proxy ownership, and Relay PC registry. Re-entering either platform is an explicit
owner decision, not a default.

The current interface is organized as an operations console: **Workspace overview** shows the team
state and immediate next actions; **Nick vault**, **Proxy vault**, **Relay PCs**, and **Setup** hold
the corresponding management work. Technical identifiers, checksums, compatibility controls, and
destructive actions stay available behind labeled details so daily operation is not mixed with
support and emergency work. Daily surfaces are scan-first: icons, status color, and tabular counts
lead, while longer reasons and recovery guidance stay behind explicit details. On wide desktops, the
complete signed-in console sits inside a centered 1600px canvas with black outer gutters, while page
content stays within a 1152px reading frame; smaller screens continue to use the full available width.
Parked Content, Queue, Facebook, Targets, and Health routes use the same hierarchy and mobile record
cards, but their rollout state and server-side posting guards remain unchanged. Sign-in, empty,
error, confirmation, and destructive-action states use the same visual language and touch targets.

**Relay archive reproducibility, 25 September 2026:** Packaging normalizes the three delivered
Windows scripts to CRLF while preserving their bytes and PowerShell UTF-8 BOM. The candidate pins
the clean-checkout archive; the earlier `e749be84...7439ff` archive remains historical evidence.
Final committed-source rebuild, quality and acceptance checks remain required.

**Current source candidate, 30 September 2026:** Browser `0.3.30` / Relay `22`, candidate
`20260930-browser-0.3.30-relay-22-self-service-onboarding-cft`, carries local-only operator-key
self-enrollment plus the latest Relay bootstrap and account-ticket hardening. Relay v22 archive
`43a49411...b494c` is published and full-read verified. The
independently built 0.3.28 payloads matched but were rejected before publication because the
installed payload omitted the fork MIT license and retained Electron's copyright metadata. Final
0.3.30 quality, two-build comparison, immutable installer publication, production deployment and
second-PC onboarding acceptance remain required. Distribution stays **HOLD** until those gates
close. See the workspace [self-service onboarding plan](../plans/260928-2219-full-team-self-service-onboarding/plan.md).

**Historical Browser candidate, 22 September 2026:** candidate
`20260922-browser-0.3.24-relay-18-fast-profile-reuse-cft` pins a locally built and smoke-verified
Relay v18 artifact. It remains **NO-GO for operator promotion**: two isolated Browser builds,
candidate-only publication, exact clean-VM activation/install/repair/uninstall, packaged Relay and
real proxy/DNS/WebRTC acceptance, unfamiliar-operator, second-PC, SmartScreen/UAC and canary gates
remain open. Keep the installer route fail-closed and do not distribute it. The published 0.3.23
artifacts and accepted 0.3.17 tuple remain historical evidence, not approval for this candidate.

**Historical platform status, 1 September 2026:** the nick vault, Reddit/Facebook posting-safety pipeline,
health checks, and Facebook Pages publisher are implemented (now out of rollout scope, see above).
TikTok nick/browser-profile setup and manual
launch are available for a controlled technical pilot; TikTok content, scheduling, warmup, and
posting automation remain parked. The hardened Lane A Web deployment is live; its last 24-hour
health evidence is 947/947 HTTP 200 with zero server 5xx, and the authorized Relay v16 full-GET/hash
check passes. The bounded credentialed/admin smoke also passes; the owner signed CONDITIONAL GO for
Lane A on 1 September 2026, accepting residual risks 1–8.
The historical intermittent 503 incident is mitigated under monitoring; the exact R2 latency trigger
remains unconfirmed. The Relay floor is 13 by design, not while waiting: 13 is the first build carrying the C26 fix, and
nothing since has a known hole, so there is no security reason to refuse 14 or 15. Fleet migration is
a separate matter — one owner machine has reinstalled 0.3.13/v16, the second remains unobserved. Browser installer reproducibility,
Browser CI, real-environment, identity, and canary gates remain open for the separate Browser lane;
Lane C is CLOSED because there is no CloakBrowser channel.
See the [development roadmap](docs/development-roadmap.md).

### Historical internal beta boundary — 29 August 2026 (not current instructions)

The older Web/Facebook pilot and `0.3.13`/Relay v16 Browser candidate are retained for history only.
They are not current onboarding instructions. Read the [team-ready rollout guide](docs/team-ready-rollout.md)
and [internal beta release guide](docs/internal-beta-release.md) for the present Web/Relay boundary;
Browser distribution remains **HOLD** while the current candidate gates are open.

This file is the operational handbook for installing, running, and using the product. Product intent,
architecture, code maps, conventions, and history live under [docs/](docs/README.md). User-facing
terms are fixed in the [UI glossary](docs/ui-glossary.md): a **nick** is a shared vault record, a
**browser profile** is local data on one PC, and a **Relay PC** is the registered PC that receives
tickets.

Changing an existing nick's proxy is an **ADMIN** responsibility. Operators still update shared
day-to-day fields such as karma, status, and voice, but the edit form shows the current proxy
read-only with the primary contact from `ADMIN_EMAILS`. Proxy and browser-profile ID changes are
recorded as before-to-after values in the same transaction as the account update; browser-profile
authorization itself is unchanged pending a separate owner decision.

## What it is

This is not a bot farm. It is a shared nick vault and operator console: every browser-backed nick
has one responsible person and one Relay PC that owns the local browser profile. The team writes the
content; MKTTool records ownership, technical readiness, and posting-safety checks. It does not
certify browser identity isolation.

For every browser-backed Reddit or TikTok nick: **1 nick = 1 static proxy = 1 browser profile = 1
assigned Relay PC.** Database and server-side authorization enforce the ownership
boundaries; no UI path may bypass them.

> Facebook accounts used only to administer Pages may leave proxy and antidetect profile empty,
> because Page publishing uses the official Graph API without opening a browser or applying a
> browser profile configuration. The database still prevents two accounts from sharing a real proxy; it simply does
> not require one for this API-only case.

## Yêu cầu

- Node.js 24.x for application and Relay builds; Node.js 22.x remains the supported floor and is
  required by the dedicated PostgreSQL contracts and offline release-ceremony tools
- **PostgreSQL 17** — bản cài native, không cần Docker
- MKT Browser technical build for the controlled Windows candidate (preferred); AdsPower remains a
  secondary compatibility adapter, not a Browser/Relay rollout path
- Proxy tĩnh (static ISP), mỗi nick một IP

## Cài đặt

Dựng hai database trước — một cho vận hành, một **riêng** cho bộ test:

```bash
createdb -U postgres mkttool_dev
createdb -U postgres mkttool_test
```

> Thư mục `bin` của Postgres phải nằm trong PATH (mặc định trên Windows:
> `C:\Program Files\PostgreSQL\17\bin`). Thiếu nó thì `npm run db:backup` không chạy được vì
> không tìm thấy `pg_dump` — và công cụ sẽ nói đúng câu đó chứ không báo lỗi mơ hồ.

```bash
npm install
cp .env.example .env
npm run vault:keygen        # chạy HAI lần: một khóa cho VAULT_KEY_SERVER,
                            # một khóa cho VAULT_KEY_OPERATOR trong .env
                            # rồi điền DATABASE_URL + TEST_DATABASE_URL
npm run db:upgrade
npm run dev                 # http://localhost:3000
```

> **`TEST_DATABASE_URL` phải trỏ vào một database riêng có tên kết thúc bằng `_test`.** Bộ test
> `DROP SCHEMA` không hỏi lại trước mỗi lượt chạy, nên nó từ chối chạy trên database không đúng
> quy ước đặt tên. Trỏ nhầm vào database vận hành là mất sạch kho danh tính, mất theo kiểu không
> kịp hối hận — quy ước tên rẻ hơn nhiều so với hậu quả.

> **Cả hai khóa phải được sao lưu vào password manager.** Mất khóa là mất vĩnh viễn phần dữ
> liệu thuộc vùng đó, không khôi phục được bằng bất kỳ cách nào.
>
> Kho chia làm **hai vùng khóa**: `VAULT_KEY_SERVER` giữ mật khẩu proxy và token Facebook —
> máy chủ cần chúng để làm việc; `VAULT_KEY_OPERATOR` giữ mật khẩu, email và TOTP của nick.
> Đích đến là khóa operator **không nằm trên máy chủ**, để chiếm được máy chủ cũng không mở
> nổi một mật khẩu nick nào. Vùng của từng cột khai ở
> `src/lib/crypto/encrypted-field-registry.ts`.
>
> Đang nâng cấp từ bản một khóa? Đặt **cả hai** biến bằng đúng giá trị `VAULT_KEY` cũ, rồi tách
> thật bằng `npm run vault:rekey -- --domain=operator --new-key=<hex>`.

> **`TEAM_TIMEZONE` là biến bắt buộc.** Thiếu nó app dừng ngay kèm thông báo, không tự lùi về
> giờ máy. `.env.example` đã điền sẵn `Asia/Ho_Chi_Minh` — xem [Múi giờ](#múi-giờ) bên dưới.

## Múi giờ

**Một múi giờ cho cả team, không phải giờ của máy đang chạy.** `TEAM_TIMEZONE` quyết định
"hôm nay" bắt đầu và kết thúc lúc nào, và mọi thứ dưới đây đọc nó:

| Chỗ | Vì sao quan trọng |
|---|---|
| Luật hạn mức ngày (luật 4) | "2 bài một ngày" phải cùng nghĩa với mọi người |
| Cold start (luật 2) | hết cold-start lúc nào |
| Giãn cách hai bài cùng sub (luật 5) | mốc 24 tiếng |
| Ô chọn giờ ở `/queue` | gõ 21:30 thì job rơi đúng 21:30 giờ team |
| Mọi ngày giờ hiển thị | ai mở cũng thấy một con số |

Vì sao phải cứng nhắc thế: `setHours(0,0,0,0)` cắt ngày theo giờ **của máy đang chạy**. Một
người dùng thì không ai thấy gì. Hai người ngồi hai múi giờ là **cùng một job cho hai kết quả
khác nhau** — luật hạn mức đếm sang ngày khác, cold-start hết sớm hoặc muộn vài tiếng — và
không có gì báo rằng nó vừa lệch. Đó là lý do có một test quét mã nguồn cấm hẳn họ hàm
`getHours` / `setHours` / `toLocaleDateString` trong `src/`
([machine-clock-ban.test.ts](src/lib/format/machine-clock-ban.test.ts)): kiểu hỏng này không
làm test nào đỏ, nên phải cấm thẳng.

> ⚠️ **Đổi `TEAM_TIMEZONE` thì phải build lại**, không phải chỉ khởi động lại. Ô chọn giờ chạy
> ở trình duyệt cũng đọc biến này, và giá trị được nhúng vào bundle lúc build (xem
> `next.config.ts`).

### Nhận bản mới

```bash
npm install
npm run db:upgrade
```

`db:upgrade` xem bản mới có thay đổi cấu trúc database không. Không có thì nó nói vậy rồi dừng.
Có thì nó **sao lưu trước**, áp xong mới báo — và nếu áp hỏng thì chỉ luôn tên file sao lưu kèm
đúng lệnh `psql` để nạp lại. Chạy lại nhiều lần không sao: đã mới nhất thì nó không làm gì.

> ⚠️ **Có thay đổi cấu trúc thì phải khởi động lại `npm run dev`.** Dev server nạp bản mô tả
> database một lần lúc khởi động và giữ nguyên trong bộ nhớ, nên nó vẫn tin là cột mới không tồn
> tại — biểu hiện là lỗi đỏ `Unknown argument` ngay giữa màn hình dù code và database đều đúng.
> Khởi động lại vẫn báo y hệt thì xóa thư mục `.next` rồi chạy lại.

> Đừng dùng `npm run db:migrate` cho việc này. Đó là lệnh của người phát triển: nó có thể hỏi
> lại, có thể tạo migration mới, và trong vài tình huống còn đề nghị dựng lại database từ đầu —
> tức xóa sạch kho danh tính.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở localhost:3000 |
| `npm test` | Chạy unit test |
| `npm run lint` | Chạy ESLint |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run build` | Build production |
| `npm run db:upgrade` | **Nhận bản mới thì chạy lệnh này** — sao lưu rồi áp thay đổi cấu trúc |
| `npm run db:migrate` | Tạo migration mới (chỉ dùng khi phát triển) |
| `npm run db:backup` | Sao lưu database của máy này ra `data/backups/` |
| `npm run db:backup:remote` | Hút bản sao từ **máy chủ thật** về máy này (cần `PRODUCTION_DATABASE_URL`) |
| `npm run proxies:import <file>` | Nhập hàng loạt proxy từ file `host:port:user:pass` của nhà cung cấp |
| `npm run proxies:import-sqlite` | Nhập proxy từ `dev.db` của bản SQLite cũ sang Postgres. **Mặc định chỉ xem trước**, thêm `-- --apply` mới ghi. Khóa cũ khác khóa hiện tại thì khai qua `VAULT_KEY_LEGACY` |
| `npm run db:studio` | Mở Prisma Studio xem database |
| `npm run vault:keygen` | Sinh khóa mã hóa mới (dùng cho cả hai vùng khóa) |
| `npm run keys:server-keygen` | Sinh cặp khóa ký vé **mới** cho máy chủ — in khóa riêng để dán vào `.env` và khóa công khai để chép sang từng cầu nối |
| `npm run keys:server-pubkey` | In khóa công khai của khóa ký **đang dùng** — cần mỗi lần cài cầu nối lên máy mới |
| `npm run keys:relay-keygen` | Sinh cặp khóa X25519 cho **một máy** chạy cầu nối. Chạy trên chính máy đó: khóa riêng ở lại, khóa công khai gửi cho quản trị viên ghi vào sổ tại `/relay-devices` |
| `npm run relay:build` | Đóng gói cầu nối thành `.exe` + bộ cài. **Chỉ chạy được trên Windows** — SEA gói runtime của chính máy build |
| `npm run relay:publish` | Đẩy gói vừa build lên ngăn R2 để cả team tải ở `/relay-download`. Cần token **ghi** trong `.env` của máy build; máy chủ chỉ có token đọc |
| `npm run vault:rekey` | Xoay khóa một vùng (`--domain=server\|operator`) — mã hóa lại credential của vùng đó |
| `npm run vault:smoke` | Kiểm chứng nghiệm thu Phase 01 trên DB thật |
| `npm run vault:testotp` | Sinh TOTP secret dùng thử để kiểm chứng tính năng OTP |
| `npm run rules:smoke` | Kiểm chứng nghiệm thu Phase 02 (bộ luật) trên DB thật |
| `npm run facebook:smoke` | Kiểm chứng nghiệm thu Phase 04 (Facebook Pages) — không cần Meta App |
| `npm run health` | Dò shadowban + đọc karma cho mọi nick Reddit. Máy chủ tự chạy hằng ngày — xem [Lịch dò hằng ngày](#lịch-dò-hằng-ngày) |
| `npm run health:smoke` | Kiểm chứng nghiệm thu Phase 03 — không cần nick, không cần proxy |

## Cách test

Nguyên tắc: **tách "test công cụ" khỏi "test với nick thật"**. Chặng A và B không cần
proxy, không cần tài khoản nào, và kiểm tra được phần lớn chức năng.

| Chặng | Cần gì | Kiểm chứng điều gì |
|---|---|---|
| **A** | không gì cả | `npm run vault:smoke` + `npm run rules:smoke` + `npm run facebook:smoke` + `npm run health:smoke` + nhập dữ liệu giả qua UI: ràng buộc 1:1, bộ luật an toàn, và đường đi Facebook trong máy |
| **A+** | cầu nối | Mã hóa, lấy mật khẩu, OTP (dùng `npm run vault:testotp` đối chiếu với Google Authenticator). Ba việc này rời khỏi chặng A từ 06/08/2026 vì khóa mở bí mật nick không còn ở máy chủ — xem [Cầu nối](#cầu-nối) |
| **B** | MultiZen (miễn phí) | Profile trống, không đăng nhập gì. Bấm "Mở profile" → công cụ có mở được profile không. ✅ **Đạt 02/08/2026** — đây từng là câu hỏi chặn đường của Phase 00 |
| **C** | 1 proxy bất kỳ | Nhập proxy vào `/proxies`, gắn cho nick, bấm "Mở profile" → vào `ipinfo.io` → IP phải khớp proxy. Không cần chạm vào cài đặt MultiZen. ✅ **Đạt 02/08/2026** — [báo cáo](plans/reports/chang-c-260802-1443-proxy-push-verification.md) |
| **D** | nick thật + proxy đúng loại | Chỉ làm sau khi A/B/C xong. Xem quy trình cold-start ở [Phase 00](plans/260801-2030-multi-account-posting-console/phase-00-preparation-and-feasibility-check.md) |

> Đừng gộp proxy test với proxy dùng thật. Proxy datacenter giá rẻ dùng để kiểm tra
> "profile có ăn đúng IP không" thì được, nhưng đưa tài khoản thật vào đó là giết tài khoản.

## Workspace input order

`/setup` now presents one Relay-first operator journey before the database-backed readiness list:

1. **Download Relay** from the existing authenticated release channel and install it on this PC.
2. **Register this Relay PC** and wait for administrator approval when required.
3. **Receive nicks and proxies** by completing the shared-vault handoff below.

The final step keeps workspace handoff separate from the parked posting checklist, so handing over
the shared identity workspace does not reopen a posting workflow.

**Workspace handoff determines readiness:**

0. **Relay PC** (`/setup`) — enroll and approve at least one active operator PC; `/relay-devices`
   remains the administration and recovery surface.
1. **Account proxies** (`/proxies`) — buy and import proxies before acquiring established accounts.
2. **Observer proxy** (`/proxies`) — provide the separate outsider view used by health checks.
3. **Accounts** (`/accounts`) — record each account, its proxy, voice, and cold-start period.
4. **Owner and PC assignment** (`/accounts`) — bind every active account to its responsible operator
   and Relay device.

MKT Browser is not distributed from `/setup`. It appears only as a secondary boundary notice and as
diagnostic data inside the collapsed support details for the separate Browser lane. Browser health
does not block Relay download, Relay PC registration, or workspace readiness. The controlled
installer release does not imply identity-isolation approval.

**Posting preparation is a separate checklist:** publishing targets, content, and the first queued
job remain implemented, but this branch is hidden while all posting platforms are outside the
2 September rollout scope. It appears again only when at least one platform is explicitly reopened;
its progress never changes workspace handoff readiness. A connected Facebook Page still creates its
publishing target automatically when that workflow is in scope.

> **Bước 0 đứng trước là có lý do.** Profile antidetect của nick được dựng trên **máy của người
> phụ trách**, nên máy đó phải có mặt trong sổ trước — xem
> [Nick ghim vào một máy](#nick-ghim-vào-một-máy).

### Một nick Reddit đi qua ba chặng, không phải một form

Bước 3 ở trên chỉ là chặng đầu. Hai chặng còn lại nằm ở **trang chi tiết nick**, và mỗi chặng tự
hiện ra khi tới lượt:

| Chặng | Làm ở đâu | Xong thì có gì |
|---|---|---|
| 1. **Khai nick** | `/accounts` → *Thêm nick* | proxy, giọng viết, bí mật, và **người phụ trách** |
| 2. **Dựng profile** | thẻ *Việc tiếp theo — dựng profile antidetect* | profile mang sẵn proxy + cài đặt profile, nick **tự ghim vào máy vừa tạo** |
| 3. **Đăng nhập lần đầu** | thẻ *Việc tiếp theo — đăng nhập lần đầu* | đủ điều kiện thao tác kỹ thuật; identity isolation chưa được chứng minh |

Không phải nhớ thứ tự: cột **Sẵn sàng** nói còn thiếu gì, và trang chi tiết chỉ hiện đúng một thẻ
"việc tiếp theo" tại một thời điểm.

**Chặng 3 tồn tại vì nút tạo profile sinh ra một trình duyệt trắng** — có proxy, có cài đặt profile,
chưa một cookie nào. Mở nó lên, tự đăng nhập nick vào đó, rồi bấm **"Đã đăng nhập được"**. Làm
ngay đầu cold-start: đăng nhập lần đầu từ một IP lạ là lúc hay bị đòi xác minh nhất. Cấu hình này
không phải bằng chứng cô lập danh tính; người vận hành vẫn tự xử lý login/OTP/CAPTCHA.

### Nick Reddit đăng nhập bằng Google

Nick Reddit của team **không có mật khẩu Reddit** — chúng đăng nhập bằng nút *Continue with
Google*. Nên form thêm nick không hỏi ô đó, và ba ô liên quan mang đúng tên:

| Ô | Là gì |
|---|---|
| **Email Google** | tài khoản Google dùng để đăng nhập Reddit |
| **Mật khẩu Google** | thứ **thật sự** mở được nick |
| **Mã 2 lớp của Google** | tùy chọn, xem ngay dưới |

**Mã 2 lớp lấy ở đâu:** bật *Xác minh 2 bước* cho tài khoản Google → chọn **Ứng dụng xác thực** →
chuỗi chữ+số hiện cạnh mã QR. Dán chuỗi đó vào là bấm **Lấy OTP** ngay trên máy đang mở profile,
khỏi mò điện thoại. Chưa bật 2 lớp thì để trống — ô này không bắt buộc.

Nick **Facebook** thì ngược lại: vẫn có mật khẩu nick và vẫn bắt buộc.

### Nick này đã dùng được chưa

Một nick Reddit cần đủ **tám** điều kiện kỹ thuật: giọng viết, proxy, proxy còn sống, id profile,
**đã đăng nhập lần đầu**, chủ, máy, và hết cold-start. Nick Facebook chỉ cần chủ và giọng viết —
Fanpage đăng bằng Graph API nên không có proxy, profile hay máy nào để đòi.

Không phải tự ghép tám thứ đó bằng mắt: cột **Sẵn sàng** ở `/accounts` nói ngay, và trang chi tiết
nick hiện một khối liệt kê từng việc còn thiếu kèm chỗ sửa. Ba màu, ba nghĩa khác nhau:

| Màu | Nghĩa |
|---|---|
| 🟢 Đủ điều kiện cấu hình | có thể tiếp tục thao tác theo quy trình; không phải identity approval |
| 🟡 Đang chờ | không ai phải làm gì, chỉ chờ hết cold-start |
| 🔴 Chưa dùng được | có người phải làm gì đó |

Phân biệt **chờ** với **thiếu** là chủ ý: gộp chung thì một nick đang cold-start đúng lịch trông
y hệt một nick quên gắn proxy.

### Sửa và xóa

Bấm vào tên bất kỳ dòng nào trong bảng là vào trang chi tiết, ở đó sửa được mọi thứ và có nút
xóa. Ba điều cần biết trước khi dùng:

**Ô mật khẩu để trống là giữ nguyên.** Mật khẩu không bao giờ được đổ ngược ra màn hình nên form
sửa không thể hiện giá trị cũ. Chỉ gõ vào khi thật sự muốn thay.

**Sửa nick, đích hoặc content là bộ luật tự chấm lại.** Karma, trạng thái, `minKarma`, tỷ lệ promo,
thân bài — tất cả đều là đầu vào của luật. Sửa xong, mọi job đang chờ liên quan được chấm lại ngay
và thông báo nói rõ đã chấm mấy job, mấy job vừa chuyển sang **BỊ CHẶN**. Job đã đăng thì không đụng
tới: trạng thái cuối là cuối.

**Two tabs cannot silently overwrite the same nick.** The nick edit and owner/Relay PC assignment
forms carry the `Account.updatedAt` revision that was rendered with the page. A save updates only
that revision; if another tab or teammate saved first, the whole stale write is rejected and the
operator must reload before trying again. The rejected write creates no audit row and does not
recheck queued jobs. This is optimistic concurrency on the two account write paths, not an app-wide
lock.

**Xóa bị chặn khi còn thứ trỏ tới**, kèm câu nói rõ vướng gì ("còn 12 job, 30 tương tác đã ghi").
Đó không phải phiền hà mà là chủ ý: job và tương tác cũ chính là thứ luật hạn mức, luật tỷ lệ promo
và luật đụng độ thread đếm — xóa đi thì bộ luật cho qua những bài lẽ ra phải chặn, mà không có gì
báo rằng nó vừa mù đi.

> Nghỉ một nick thì đổi trạng thái sang **Đã chết**, nghỉ một đích thì bỏ tick **Đang dùng**.
> Cả hai giữ nguyên lịch sử. Nút xóa chỉ để dọn thứ vừa nhập sai vài phút trước.

Nền tảng của nick và của đích **không sửa được** sau khi tạo: đổi nó là biến mọi job cũ thành
nick-nền-tảng-này đăng vào đích-nền-tảng-kia, đúng thứ bị chặn ngay từ lúc tạo.

## Bộ luật an toàn

Mỗi lần xếp lịch, các phép kiểm tra chạy trước và trả về `ALLOW | WARN | BLOCK` kèm lý do
tiếng Việt. Đèn hiện ngay lúc chọn nick/đích, không đợi tới lúc bấm lưu.

Cột **Áp cho** cho biết luật chạy ở đâu. `Cộng đồng` = Reddit và Facebook Group — nơi mình là
khách trong nhà người khác, có mod và có hàng xóm để ý. Fanpage là kênh của chính mình nên
bốn luật giữ nhịp không áp: đăng 5 bài một ngày hay đăng toàn nội dung bán hàng đều bình thường.

| # | Luật | Chặn khi | Áp cho |
|---|---|---|---|
| 1 | Sức khỏe nick | trạng thái khác `ALIVE` | mọi nền tảng |
| 2 | Cold start | giờ đăng còn nằm trong cold-start | mọi nền tảng |
| 3 | Điều kiện đích | thiếu karma hoặc nick chưa đủ tuổi theo luật sub | mọi nền tảng |
| 4 | Hạn mức ngày | nick đã có 2 bài trong ngày đó | **cộng đồng** |
| 5 | Nghỉ giữa 2 bài | hai bài cùng sub cách nhau dưới 24 tiếng | **cộng đồng** |
| 6 | Tỷ lệ promo | chưa đủ 9 bài hữu ích cho bài quảng cáo tiếp theo | **cộng đồng** |
| 7 | Trùng nội dung | giống ≥ 70% một bài cùng nền tảng trong 30 ngày | mọi nền tảng |
| 8 | Đụng độ thread | nick khác của mình đã chạm đúng thread đó | **cộng đồng** |
| 9 | Chính sách link | sub cấm link mà bài có link | mọi nền tảng |
| 10 | Kết quả dò gần nhất | lần dò cuối nói nick bị ẩn / dính checkpoint | **Reddit** |

Luật 10 đọc thứ **người ngoài nhìn thấy**, còn luật 1 đọc thứ **mình tự đặt**. Chỗ hai cái lệch
nhau mới là chỗ đáng lo: gỡ cách ly một nick về "Khỏe" bằng tay thì luật 1 cho qua ngay, nhưng
luật 10 vẫn thấy lần dò cuối nói nick bị ẩn và chặn cho tới khi có lần dò mới chứng minh ngược lại.
Nick chưa dò lần nào, dò lâu quá (mặc định 3 ngày), bộ dò hỏng, hoặc dò xong mà không có bài nào
đánh dấu đã đăng để đối chiếu — cả bốn đều làm luật cảnh báo. *Không có tin xấu* không phải là
*tin tốt*, đó là *không có tin*.

Luật 6 và 8 là hai luật không cộng đồng nào tha thứ. **Luật 8 không cho ghi đè** — hai nick cùng
chủ đụng một thread là tín hiệu phối hợp rõ nhất mà nền tảng bắt được. Các luật còn lại ghi đè
được nhưng bắt buộc nhập lý do và luôn để lại `AuditLog`.

Luật 8 chạy ở hai chỗ với hai mức khác nhau, và checklist ghi rõ đang là mức nào:

- **Lúc xếp lịch** bài chưa tồn tại nên chưa có thread để so — luật chỉ cảnh báo "nick khác vừa
  hoạt động cùng đích". Checklist hiện đúng tên đó, không ghi trống "Đụng độ thread ✓" để khỏi
  ai tưởng đã kiểm thứ chưa kiểm được.
- **Lúc ghi tương tác** (`/queue` → "Ghi tương tác thủ công") mới có link thread thật, và đó là
  nơi nhánh CHẶN chạy.

Luật bị bỏ qua **không im lặng**: checklist ghi rõ "Không áp dụng cho nền tảng này: …" để không ai
tưởng công cụ đã kiểm mà thật ra không.

Ngưỡng chung nằm ở bảng `RuleConfig`, sửa bằng `npm run db:studio` — không cần sửa code, không
cần build lại. Thiếu key nào thì dùng mặc định trong `src/lib/rules/rule-thresholds.ts`.
Ngưỡng riêng của từng sub (karma, tuổi nick, tỷ lệ promo, cho link hay không) thì sửa thẳng ở
trang chi tiết của đích đó.

> Đăng xong nhớ bấm **"Đã đăng"** và ghi lại các lần comment/upvote. Bộ luật chỉ biết những gì
> được ghi lại — không ghi thì luật chặn đụng độ thread không có gì để so.

## Đăng bài

Chỉ **Fanpage** đăng được bằng một nút (Graph API). **Reddit và Facebook Group phải đăng tay** —
Reddit chưa có bộ tự đăng (Phase 05), còn Group thì Meta gỡ quyền từ 04/2024.

Xếp lịch **không phải là hẹn giờ tự đăng**: nó ghi giờ dự kiến và chấm luật theo giờ đó. Đến giờ,
bài không tự lên.

Bài đăng tay đến hạn trong 24 tiếng tới hiện ở thẻ **"Đăng tay"** ngay trang tổng quan, cũ nhất
lên trước, quá giờ thì có nhãn riêng. Mỗi dòng có sẵn:

| Nút | Việc |
|---|---|
| **Mở profile** | Đẩy proxy vào profile antidetect rồi mở — không phải sang trang nick tìm lại |
| **Copy tiêu đề** / **Copy thân bài** | Chỉ Reddit, vì form Reddit có hai ô rời. Thân bài **không kèm tiêu đề**, dán vào là không bị lặp |
| **Copy nội dung** | Chỉ Facebook Group, vì ô đăng của group chỉ có một |
| Tên đích | Mở thẳng sub/group ở tab mới |

Link trong content luôn được dán kèm cuối phần thân bài: Reddit và Group đều không dựng thẻ xem
trước từ tham số như Page, nên link nằm ngoài thân bài là link biến mất khỏi bài.

> Đăng xong **phải quay lại `/queue` bấm "Đã đăng"** và dán link bài. Bộ luật chỉ biết những gì
> được ghi lại: không bấm thì luật đụng độ thread không có gì để so, và bộ dò shadowban không có
> bài nào để đối chiếu — nick sẽ rơi vào ô "Chưa đối chiếu được" dù vẫn đang đăng đều.

Bấm nhầm thì sửa được: job **Đã đăng / Bỏ qua / Lỗi** có nút **"Trả về chờ đăng"**. Nó xóa cả link
lẫn dấu vết đụng thread mà lượt "Đã đăng" đã ghi, rồi chấm lại luật — nên chỉ dùng khi bài **chưa
thật sự lên**. Trả về một bài đã lên thật là tự mở đường đăng nó lần thứ hai.

### Khỏi chép link: "Quét & gán link"

Với job Reddit còn đang mở, dòng job có nút **"Quét & gán link"**. Đăng tay xong bấm nó: bộ dò mở
trang profile công khai qua proxy quan sát viên (~30-60 giây), thấy bài vừa lên và **tự đánh dấu
đã đăng kèm link** — không phải copy link dán lại.

Nó chỉ tự ghi khi chắc. Ba cửa phải qua hết:

| Cửa | Vì sao |
|---|---|
| Cùng sub với đích của job | Một nick đăng nhiều sub; ghép nhầm sub là gán link bài này cho job kia |
| Đăng cách giờ dự kiến ≤ 24 tiếng | Lịch là giờ **dự kiến**, đăng trễ nửa ngày là bình thường |
| Slug tiêu đề trong link khớp content | Cửa chặn đúng ca dán nhầm link giữa hai bài cùng sub |

Còn lại đúng **một** ứng viên mới ghi. Hai bài cùng khớp một job, hoặc hai job cùng khớp một bài
→ không gán bài nào, chỉ báo. Bài đăng ngoài công cụ (nuôi nick, bài của chủ cũ) không có job nào
để ghép nên vẫn hiện ở cảnh báo **"Có bài chưa ghi"** — vào `/queue` ghi tay.

Cửa sổ quan sát là **7 ngày** và chỉ đọc trang đầu profile, nên bài cũ hơn không tự gán được.
Facebook không có bộ dò: Fanpage đã tự có link từ Graph API, Group thì phải bấm tay.

## Kiến trúc

```
src/
├── app/                     Next.js App Router — trang và API
│   ├── accounts/            danh sách + chi tiết nick (sửa, xóa, copy credential)
│   ├── content/             kho content team viết
│   ├── queue/               hàng đợi + trang xếp lịch có chấm luật realtime
│   ├── facebook/            kết nối Fanpage, trạng thái token
│   ├── health/              bảng sức khỏe, lịch sử dò, biểu đồ karma
│   ├── login/               màn hình đăng nhập Google
│   ├── relay-devices/       sổ đăng ký máy chạy cầu nối (ADMIN đăng ký / thu hồi)
│   ├── proxies/ targets/    danh sách + trang chi tiết để sửa/xóa
│   └── api/
│       ├── accounts/[id]/launch/   mở profile antidetect
│       ├── facebook/oauth/         start + callback của luồng OAuth
│       ├── health/run/             dò lại một nick ngay
│       └── rules/preview/          chạy thử bộ luật, trả verdict
├── components/              khối UI dùng chung (ui/, vault/, queue/, content/, facebook/, health/)
└── lib/
    ├── accounts/            server actions (thêm/sửa/xóa) + schema form + trạng thái nick
    ├── actions/             kiểu ActionResult dùng chung cho mọi server action
    ├── antidetect/          MKT Browser owned client/adapter contract plus AdsPower adapter
    ├── audit/               tên các loại thao tác ghi vào AuditLog.action
    ├── auth/                đăng nhập Google, danh sách email cho phép, gác lối vào, hai vai trò
    ├── content/             từ vựng content + server action kho content
    ├── crypto/              AES-256-GCM cho credential — hai vùng khóa (server / operator)
    ├── db/                  Prisma client
    ├── facebook/            Graph API: OAuth, token, đăng Fanpage
    ├── format/ platforms/   định dạng ngày, gộp họ nền tảng
    ├── health/              bộ dò shadowban: phiên trình duyệt sạch, parser, đánh giá, runner
    ├── http/                đối chiếu Origin/Host cho route handler
    ├── proxies/             kiểm proxy còn sống (hỏi IP ra, chặn mở profile) + đo băng thông
    ├── queue/               server action cho job + tương tác, nhắc việc đăng tay
    ├── relay/               hợp đồng HTTP với cầu nối + bộ gọi xuống 127.0.0.1 từ trình duyệt
    ├── rules/               bộ luật an toàn — mỗi luật một file
    ├── tickets/             vé ủy quyền: khóa ký của máy chủ, sổ đăng ký máy, phát/xác minh vé
    └── totp/                sinh mã OTP 2FA
```

Mỗi luật là một hàm thuần `(ctx: RuleContext) => RuleVerdict`. Toàn bộ việc hỏi database nằm ở
`rule-context-builder.ts`, nên thêm luật mới chỉ là thêm một file và một dòng trong `rules-engine.ts`.

Stack phía Web: Next.js 16 + TypeScript + Prisma 7 + PostgreSQL. Web runs on Railway; Relay is a
separate Windows program on the operator device and calls authenticated local MKT Browser MCP.
There is no Redis dependency.

> **Chỗ chạy hiện tại.** Web đã chạy thật trên Railway từ 06/08/2026. Bản phát triển vẫn chạy
> bằng `npm run dev`; `Dockerfile` dùng cho môi trường máy chủ, không cần để phát triển cục bộ.

> Nền dữ liệu đổi từ SQLite sang Postgres ngày 04/08/2026 — bước đầu của việc biến công cụ
> thành web chung cho team. Một file SQLite trên một máy không phục vụ được 5-6 người ở 5-6 nơi.

`playwright` chỉ dùng cho bộ dò shadowban, chạy trực tiếp qua proxy quan sát viên chứ không qua
antidetect browser — xem [Dò shadowban](#dò-shadowban). Lần đầu chạy phải cài trình duyệt:
`npx playwright install chromium`.

## Antidetect browser

Production Relay constructs `MktBrowserAdapter` directly. The owned desktop contract defaults to
`http://127.0.0.1:47822`; set `mktBrowserUrl` in `relay-config.json` only for an explicit loopback
override. Retired MultiZen provider/config keys are not read as a fallback.

MKT Browser requires a **bearer token**, but ordinary operators do not copy it. On Windows, Relay
reads the token from MKT Browser's owned local data directory whenever it needs to connect, including
when MKT Browser is enabled after Relay has already started. `mktBrowserToken` in `relay-config.json`
remains only as a development override for disposable/custom data roots. Never put this token in
server environment variables. Without a discoverable token, Relay can still reveal credentials and
OTP values, but profile actions fail closed with a configuration error. See the
[MKT Browser plan](plans/260810-0244-mkt-browser-noi-bo/plan.md). Windows x64 is the only v1 and
team-demo platform; macOS is deferred to MKB-07. Distribution remains a later gate, and v1 retains
the upstream UX/UI.

That discovered token is **profile-management only**. It cannot navigate, click, type, read pages,
access cookies, or send raw CDP, and the current build issues no page-control token. Current source
supports MKT Browser contract version `5`: contract 4's managed-profile locking, correlated
operation diagnostics, local-install readiness, no MCP profile deletion, idempotent create, and
atomic launch remain intact; contract 5 adds sanitized licence-capacity state and an explicit
profile-lifecycle refresh that never launches or queues a profile. The reviewed installed candidate
may still report contract 4 until a new exact tuple is accepted. Relay v16 preserves each ticket `jti` as the
`operationId`; mismatched diagnostics fail closed and support detail contains only stage, code,
duration, and runtime versions.

Relay `/health` now evaluates the live MKT Browser process, contract, engine, and capabilities on
**this PC**. Historical enrollment by itself is not `Ready`. Profile list/create/launch remain blocked
until the current local runtime is operational, and the setup page shows an actionable repair state
when it is not.

### Correct-proxy engineering smoke test

The MKB-00 positive-path check can use a dedicated proxy without storing it in the database or
printing it in terminal output. Put the five fields below in
`%LOCALAPPDATA%\MKTTool\mkb00-proxy.env`:

```dotenv
PROXY_PROTOCOL=http
PROXY_HOST=
PROXY_PORT=
PROXY_USERNAME=
PROXY_PASSWORD=
```

Then run `npm run mkt-browser:proxy-smoke -- --proxy-file`. The script validates and immediately
deletes the handoff file before making any network request. It independently probes the proxy,
launches a disposable MKT Browser profile, verifies that both paths observe the same non-direct exit
IP, and closes and deletes the profile. Use only a dedicated test proxy and never account data.

### Proxy được đẩy tự động

Bấm "Mở profile" là MKTTool **ghi proxy của nick vào profile trước, rồi mới mở** — không phải
nhập tay hai nơi nữa. Đẩy hỏng thì **không mở profile**, vì profile thiếu proxy sẽ chạy thẳng
bằng IP nhà mà không ai nhận ra.

> ⚠️ **Từ 06/08/2026 việc đó do cầu nối trên máy bạn làm, không phải máy chủ** — xem
> [Cầu nối](#cầu-nối). Máy chủ kiểm proxy còn sống rồi phát một tấm vé đã mã hóa; cầu nối mở vé
> ra, đẩy proxy và mở trình duyệt.

Trường **Giao thức** (`http` / `socks5`) ở `/proxies` phải khớp cổng nhà cung cấp cấp — nhiều nơi
dùng cổng khác nhau cho hai giao thức (Webshare thì cùng cổng phục vụ cả hai).

Either supported protocol keeps **DNS resolution remote**. The browser connects first to MKT
Browser's internal SOCKS5 bridge, then that bridge uses the configured upstream protocol. The
02 August baseline verified that the resolver saw the proxy IP.

> ⚠️ **The unchanged upstream-derived engine aligns the timezone to the proxy IP but does not align
> the locale.** In the 02 August baseline, a profile configured as `Europe/Stockholm` + `Svenska`
> and launched through a GB proxy changed to `Europe/London`, while `navigator.language` remained
> `sv-SE`.
>
> **Do not change the locale of an established profile.** A sudden switch from `sv-SE` to `en-GB`
> after months of stable use is a stronger anomaly than retaining the existing mismatch.

### Để công cụ tạo profile, đừng tạo tay

Trang chi tiết một nick chưa có profile có nút **"Tạo profile trên máy này"**. Người bấm phải là
**chủ nick**, và bấm trên **máy của chính họ** — dữ liệu profile được giữ cục bộ, nên một profile
dựng nhầm chỗ là một nick mà chủ nó không mở nổi. Một lần bấm là xong ba việc vốn phải làm tay:

| Việc | Trước | Nay |
|---|---|---|
| Dựng profile mang đúng proxy của nick | mở MKT Browser, gắn proxy | tự |
| Căn cài đặt profile theo quốc gia proxy | nhớ bấm **"Match proxy"** | tự — locale, múi giờ và họ thiết bị chọn theo `Proxy.country`; không phải identity proof |
| Đưa id profile về kho | chép dãy UUID sang form | tự, **và ghim luôn nick vào máy vừa tạo** |

Nút hiện xem trước trước khi bấm — *"sẽ dựng `en-US` / `America/Denver` / `windows-laptop-amd`"* —
nên biết được mình sắp tạo gì. Múi giờ chọn **có gieo hạt theo tên nick**, không phải luôn lấy
cái đầu danh sách: 5 nick trên proxy US mà cùng `America/New_York` là một mối tương quan do chính
công cụ tạo ra, ngược hẳn với việc mua 10 proxy riêng.

Tạo ở máy nào thì dữ liệu profile được ghim vào máy đó; đây là ràng buộc vận hành, không phải
bằng chứng cô lập danh tính. Muốn đổi máy sau đó thì vẫn phải nhờ quản trị viên gán lại cụm.

**Managed profile creation and launch require the matching approved Browser/Relay tuple.** Older Relay
builds cannot preserve the required operation correlation or prove the managed capabilities, so these
actions stop with an update instruction instead of falling back to an uncorrelated path. Browser
distribution is currently held; do not install or update this lane without an explicit release notice.

> **Quy trình tay** (khi tạo trong MKT Browser): gắn proxy → tab Fingerprint → bấm **"Match proxy"**
> → *rồi mới* đăng nhập lần đầu. Bấm nút của MKTTool thì **hai bước đầu** gộp làm một, và MKT Browser
> từ chối tổ hợp cài đặt mâu thuẫn nên không có đường tạo ra một profile lệch proxy. Đây vẫn chỉ là
> cấu hình vận hành; identity isolation chưa được chứng minh.

**Bước đăng nhập thì vẫn là việc của người.** Profile vừa dựng là một trình duyệt trắng — thẻ
*"Việc tiếp theo — đăng nhập lần đầu"* hiện ngay sau đó và không tắt cho tới khi có người bấm
**"Đã đăng nhập được"**. Cột **Kiểm tra thao tác** báo đỏ *"chưa đăng nhập lần nào"* suốt khoảng đó,
cố ý: một nick có cấu hình xanh mà chưa ai đăng nhập vẫn chưa đủ điều kiện thao tác.

### Proxy được kiểm trước khi mở

Bấm "Mở profile" là công cụ **đi qua chính proxy đó hỏi xem người ngoài nhìn thấy IP nào**, rồi
mới đẩy và mở. Năm kết luận:

| Kết luận | Nghĩa là | Có mở profile không |
|---|---|---|
| **Sống** | proxy trả lời, IP ra khác IP nhà | ✅ mở |
| **Chết** | không nối được, sai mật khẩu, hoặc proxy không ra được internet | ❌ **không mở** |
| **Không đổi IP** | proxy trả lời bình thường nhưng IP ra **đúng bằng IP máy này** | ❌ **không mở** |
| **Lệch nước** | proxy sống nhưng ra ở nước khác nước đã khai | ⚠️ mở, có nói rõ |
| **Không kiểm được** | dịch vụ tra cứu hỏng hoặc mất mạng — *không phải* tin tốt | ⚠️ mở, có nói rõ |

Kiểm cả kho bằng nút **"Kiểm tất cả"** ở `/proxies`; mỗi dòng cũng có nút **"Kiểm"** riêng và
một cột ghi kết luận của lần kiểm gần nhất. Proxy hỏng nổi lên thành dải cảnh báo đỏ ở trang
**Hôm nay** — không phải mở giao diện antidetect mới thấy.

Proxy **chưa kiểm lần nào** hiện đúng chữ "chưa kiểm lần nào", không hiện như đang khỏe.

> ⚠️ Phép đo trên là của **công cụ**, không phải của trình duyệt: nó chứng minh proxy còn sống,
> không chứng minh MKT Browser đang thật sự dùng nó. Lần đầu mở một profile mới vẫn nên vào
> `ipinfo.io` trong chính profile đó đối chiếu.

### Đo băng thông proxy

Mỗi dòng ở `/proxies` có nút **"Đo tốc độ (1 MB)"**: tải một file thử 1 MB qua đúng proxy đó rồi
tính megabit/giây. Kết quả ghi lại thành một cột riêng, `< 1 Mbps` là **rất chậm**, `< 5 Mbps` là
**chậm**.

**Vì sao không có nút "đo cả kho":** mỗi lượt đo tiêu **1 MB quota trả tiền** của proxy. Nhân cả
đàn là vài chục MB mỗi lần bấm, nên phép đo này chỉ chạy khi bấm tay từng cái — cái giá ghi thẳng
trên nhãn nút. Kiểm proxy còn sống thì ngược lại, chỉ tốn vài KB, bấm thoải mái.

**Ba điều phải nhớ khi đọc số đo:**

- Đây là tốc độ **tải xuống**. Đăng bài kèm ảnh/video thì thứ quyết định là tốc độ tải lên, mà
  hai chiều có thể lệch nhau rất xa trên proxy dân cư.
- Số đo là `min(mạng nhà, proxy, máy chủ thử)` — đo lúc mạng nhà đang tải thứ khác thì proxy tốt
  vẫn ra số xấu. **So tương đối** giữa các proxy đo cùng lúc thì đáng tin, so với ngưỡng tuyệt đối
  thì không.
- 128 KB đầu bị loại khỏi phép tính (TCP khởi động chậm), và proxy quá chậm thì cắt sau 8 giây —
  lúc đó câu kết quả nói rõ là chưa tải hết ngân sách.

Đo được nhưng ra lỗi thì hiện **"không đo được"**, không hiện thành số 0: proxy chưa đo được và
proxy chậm là hai chuyện khác nhau, dẫn tới hai hành động khác nhau.

MKT Browser does not expose a public CDP endpoint. The current Relay token also cannot call page
tools. Phase 05 must introduce a separately reviewed capability/token before any page interaction is
enabled; installing or enrolling MKT Browser does not enable browser automation. AdsPower may still
return a CDP endpoint through its separate adapter.

## Đăng nhập

Công cụ đăng nhập bằng **tài khoản Google**, và chỉ email nằm trong danh sách khai sẵn mới vào
được. **Không có tự đăng ký** — Google chỉ chứng minh *"người này sở hữu email đó"*, chứ không
chứng minh *"người này thuộc team"*.

The public login screen does not tell operators to edit environment variables or run server
commands. When authorization fails it shows the Google email that was just used when available and
the primary administrator contact derived from `ADMIN_EMAILS`; configuration diagnostics stay in
the server log.

### Tạo Google OAuth client (làm một lần, ~5 phút)

1. Vào [console.cloud.google.com](https://console.cloud.google.com/) → tạo project mới
   (tên gì cũng được, ví dụ `MKTTool`).
2. Menu trái → **APIs & Services** → **OAuth consent screen**:
   - **User type: External** → Create
   - Điền App name, User support email, Developer contact — ba ô đó là bắt buộc, phần còn lại bỏ qua
   - **Scopes:** không thêm gì cả. Mặc định đã có `email` + `profile`, và đó là tất cả những gì
     công cụ cần. Xin thêm quyền là tự chuốc App Review mà chẳng dùng tới.
   - **Audience:** để ở chế độ **Testing** cũng chạy được, nhưng phải thêm từng email vào
     *Test users*. Chọn **Publish app** thì khỏi phải thêm — app chỉ xin `email`/`profile` nên
     Google **không bắt xét duyệt**.
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - **Application type: Web application**
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`
4. Chép **Client ID** và **Client secret** vào `.env`.

> ⚠️ **Redirect URI phải khớp từng ký tự**, kể cả dấu `/` cuối. Và phải là `localhost` chứ không
> phải `127.0.0.1` — trình duyệt coi hai địa chỉ này là hai host khác nhau khi lưu cookie, nên
> cookie phiên đặt ở một bên không tới được bên kia. Cùng cái bẫy với luồng Facebook bên dưới.

Lên Railway thì thêm URI thứ hai `https://<tên-app>.up.railway.app/api/auth/callback/google`
và đổi `BETTER_AUTH_URL`. Giữ cả hai để vẫn chạy được ở máy dev.

### Bốn biến phải điền

```bash
ALLOWED_EMAILS="ban@gmail.com,dongnghiep@gmail.com"   # ai vào được
ADMIN_EMAILS="ban@gmail.com"                          # ai là quản trị viên
BETTER_AUTH_SECRET="<32 byte hex>"                    # khóa ký cookie phiên
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

Sinh `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Thiếu bất kỳ biến nào ở trên thì **app dừng ngay kèm thông báo rõ**, không lặng lẽ chạy ở chế độ
không có đăng nhập. Cùng nguyên tắc với `TEAM_TIMEZONE`.

### Hai vai trò

| Vai trò | Làm được gì |
|---|---|
| **ADMIN** | mọi thứ: phân công cụm, đăng ký/thu hồi máy, cấp khóa operator, và **giữ kho proxy** |
| **OPERATOR** | mọi thứ, **trừ** bốn việc trên và **trừ** bí mật của nick không phải mình phụ trách |

**Tầm nhìn thì không chia.** Ai cũng thấy nick, job, tương tác, lịch sử và cả kho proxy của người
khác — cố ý: luật đụng độ thread phải nêu đúng tên nick của đồng nghiệp thì người đọc mới xử lý
được. Thứ bị chia là **quyền ghi** và **bí mật của nick**, và chặn nằm ở tầng dữ liệu chứ không
phải ẩn nút trên giao diện: máy chủ từ chối **phát vé** cho nick không phải của bạn, kèm câu nói
rõ nick đó do ai phụ trách.

**Kho proxy chỉ ADMIN sửa được** (thêm / sửa / xóa / đo tốc độ). Mật khẩu proxy không có bản thứ
hai ở đâu ngoài kho này, nên xóa nhầm một dòng là mất tiền thật — nhà cung cấp cấp lại thì ra IP
khác, và nick gắn IP cũ coi như đổi chỗ ở. Nút **Kiểm** thì ai cũng bấm được: nó tốn vài KB và là
thứ cần bấm đúng lúc đang gấp. Nút **Đo tốc độ** đốt 1 MB quota trả tiền mỗi lượt nên đi theo
nhóm ADMIN.

When no usable proxy is available, ADMIN keeps the existing add-proxy path. OPERATOR sees a valid
waiting state instead, with the primary contact read from `ADMIN_EMAILS`; the UI does not maintain a
second administrator list.

> **Gỡ người khỏi team:** xóa email khỏi `ALLOWED_EMAILS` rồi khởi động lại. Có hiệu lực ngay,
> kể cả người đó đang mở sẵn tab — danh sách được kiểm ở **mọi request**, không phải chỉ lúc
> đăng nhập. Nick họ từng phụ trách **không bị xóa theo**, chỉ mất chủ.

## Cầu nối

> **The Relay package and MKT Browser v1 are Windows x64 only.** The current team demo and pilot
> path use Windows; macOS is deferred to MKB-07 after v1 and does not block any current gate.
> Installing an upstream browser build on Mac does not replace Relay.

**Máy chủ không mở được một mật khẩu nick nào.** Từ 06/08/2026 kho chia hai vùng khóa thật, và
vùng giữ bí mật nick chỉ mở được ở **máy của người vận hành** — bằng một chương trình nhỏ chạy
nền tên là *cầu nối*. Chiếm được máy chủ, hay đọc được biến môi trường của nó, cũng không lấy
được mật khẩu nào.

| Việc | Ai làm |
|---|---|
| Kiểm phiên đăng nhập, kiểm chủ nick, ghi nhật ký | máy chủ |
| Lấy ciphertext trong database, bọc cho đúng máy nhận, ký tên | máy chủ |
| **Mở ciphertext ra, hiện mật khẩu, đẩy proxy, mở trình duyệt** | **cầu nối** |

Ở giữa là **tấm vé**: một chuỗi đã mã hóa cho riêng chiếc máy đang ngồi, sống 30 giây, tiêu được
đúng một lần. Trình duyệt chỉ là người đưa thư — mở devtools lúc bấm nút thì đó là tất cả những
gì thấy được.

Bí mật (mật khẩu, OTP) hiện ở **một cửa sổ nhỏ do chính cầu nối phục vụ**, không hiện trên trang
web. Mở profile thì gọi ngầm, không mở tab nào.

> ⚠️ **Lưu ý:** Ba việc dưới đây bắt buộc phải có cầu nối đang chạy trên máy:
> lấy mật khẩu/OTP, mở profile, và tạo/sửa nick **có nhập bí mật mới**. Mọi việc khác vẫn chạy
> bình thường — kể cả sửa karma, trạng thái, proxy của nick, vì ba ô bí mật để trống nghĩa là
> giữ nguyên và form không cần gọi tới cầu nối.

### Cài một máy mới: hai việc, không chép gì

**Người dùng máy** chạy bộ cài, mở web app **trên chính máy đó**, vào `/setup`, rồi làm theo nút
chính để xác nhận và đăng ký máy. Không chép khóa, sửa JSON hay mở DevTools.

**ADMIN** vào `/relay-devices` thấy mục **"Đang chờ cấp khóa"**, bấm **"Cấp khóa"**. Xong.

Khóa tự về máy đó ngay lần sau người dùng mở web app — trang tự cập nhật, không phải tải lại.
**Không có mã nào để gửi cho nhau**, và không ai phải chép một chuỗi hex nào.

Đường đi của khóa: cầu nối **trên máy ADMIN** bọc `VAULT_KEY_OPERATOR` bằng bắt tay X25519 với
khóa công khai của đúng máy nhận — cùng cơ chế đang bọc ruột mọi tấm vé. Máy chủ giữ hộ cái hộp
ấy và **mở không nổi**; trang web chuyển nó đi và cũng mở không nổi. Chỉ chiếc máy nhận, bằng
khóa riêng chưa từng rời khỏi ổ cứng của nó, mở được.

> ⚠️ **Chiếc máy đầu tiên của cả team phải dán tay.** Lúc đó chưa tồn tại cầu nối nào khác để bọc
> khóa từ đó. Mở trang trạng thái của cầu nối (`http://127.0.0.1:47821`) và dán `VAULT_KEY_OPERATOR`
> vào ô cuối trang. Đó cũng là đường thoát khi cần dùng ngay mà ADMIN không online.

Vì hộp khóa bọc cho **đúng một máy**:

- Máy chưa vào sổ **không xin được vé nào** — nút bấm nói thẳng phải đăng ký ở đâu.
- Thu hồi một máy **trước khi nó kịp lấy hộp** thì khóa không bao giờ tới nơi.
- Mất laptop thì **thu hồi ngay** để chặn vé mới và gỡ ghim nick; đây là bước khẩn cấp, không phải
  remote wipe.
- Nếu máy có thể đã nhận plaintext hoặc ciphertext vùng operator, xoay `VAULT_KEY_OPERATOR`; sau
  mỗi lượt xoay, bấm **"Cấp lại khóa"** cho từng máy còn tin cậy.
- PC còn truy cập được thì cập nhật Relay lên bản 11 trở lên, rồi dùng **Retire this PC** trên đúng
  máy đó. Web kiểm tra version trước khi thu hồi server; flow sau đó xóa riêng Relay identity bằng
  authorization đã ký, giữ receipt phục hồi, và không xóa MKT Browser profiles hay MultiZen data.

> Cột **Khóa operator** trong sổ nói *"chưa cấp"*, không nói *"chưa có khóa"* — và khác biệt đó là
> cố ý. Máy lấy khóa bằng cách dán tay thì máy chủ mù hoàn toàn cho tới khi chính chiếc máy ấy mở
> web app và tự khai. Sổ chỉ khai thứ nó biết chắc.

Người có **hai máy** trong sổ phải chọn máy đang ngồi trước khi bấm — vé mã hóa cho đúng một máy,
và đoán bừa là phát một tấm vé chắc chắn hỏng. Một máy thì không hỏi.

### Finish local cleanup after revocation

If Setup identifies this PC's exact old Relay registration as revoked and owned by the signed-in
user, choose **Finish local cleanup**. On **Relay PCs**, confirm the selected PC and finish the
signed cleanup on that same physical PC. Relay v11 or later is required; both the local device ID
and public key must match. A pending protected receipt uses **Finish device retirement** to resume
recovery; that message alone does not establish ownership.

After cleanup and signed finalization finish, restart Relay and return to **Setup** to register a
fresh Relay identity. The old record stays revoked. Resume normal operator-key approval for the
new identity. Repair or reinstall preserves local identity and cannot complete this cleanup.

Owners can clean up only their own already-revoked record. Active retirement and nick unpinning
remain ADMIN actions; owner cleanup never changes nick assignments. Other binding or ownership
conflicts still require an administrator. Browser profiles and MultiZen data are preserved.
See the [current validation checkpoint](docs/development-roadmap.md#relay-owner-cleanup---8-september-2026)
before treating this candidate recovery path as verified on an installed PC.

### Vì sao có hạn nhịp 10 vé một phút

Nó không chặn người ngoài — hai lớp gác đã làm việc đó. Nó chặn **một phiên bị trộm**: không có
hạn thì "rút sạch bí mật của mọi nick" là chuyện của vài giây, và `AuditLog` chỉ ghi lại để đọc
sau khi mọi thứ đã xong. Có hạn thì nó thành chuyện của nhiều phút — đủ để một người nhận ra tab
của mình đang tự bấm nút. Vé mở profile không bị đếm — nhưng từ 07/08/2026 nó không còn là lối
rút mật khẩu proxy nữa, vì vé chỉ tới được đúng chiếc máy giữ nick. Xem mục dưới.

## Nick ghim vào một máy

Nguyên tắc gốc `1 nick = 1 proxy = 1 profile cấu hình` dài thêm một đoạn: **`= 1 máy = 1
người`**. Và database ép nó, y như cách nó đang ép `1 nick = 1 proxy`.

The reason is that `antidetectProfileId` identifies a local SQLite record on **one specific
machine**. MKT Browser intentionally has no cross-device profile synchronization or account
service, so a profile ID is meaningless without the device that owns it.

| Ô | Trả lời câu hỏi |
|---|---|
| **Người phụ trách** | ai được **xin** mật khẩu / OTP của nick |
| **Máy giữ profile** | vé bay **về đâu** |

Hai ô gán cùng một lượt ở thẻ **"Phân công cụm"** trong trang chi tiết nick, và chỉ ADMIN gán
được. Máy phải là máy **của chính người phụ trách** — công cụ từ chối cặp lệch kèm lý do chứ
không lưu.

**Vé đi tới máy giữ nick, không tới máy người bấm.** Đó là toàn bộ thay đổi, và nó đóng ba chỗ:

| Trước | Nay |
|---|---|
| Launching another owner's profile still issued a ticket and the remote Relay returned an ambiguous browser error | Reject with the exact device name and owner email |
| Ruột vé chứa mật khẩu proxy đã giải mã → ai đăng nhập được cũng rút được cả kho bằng cách bấm nút | Mật khẩu proxy chỉ tới chiếc máy vốn đã phải biết nó |
| Nút "Mở profile" ở thẻ nhắc việc hỏng với người có hai máy (không có ô chọn máy) | Máy chủ tự tra sổ, không hỏi gì |

**ADMIN không có ngoại lệ ở nút mở profile**, khác với đường lấy bí mật. Không phải vì siết chặt
hơn mà vì ngoại lệ ở đó vô nghĩa: vé bọc mật mã cho khóa của máy kia, nên phát được cũng không mở
nổi. Đường khôi phục của ADMIN là **gán lại cụm** — một thao tác có tên, có `AuditLog`.

### Device transfer remains gated

Managed MKT Browser profiles cannot use the generic desktop export path. MKB-05 owns the controlled
transfer lock, recipient-encrypted export/import, and source retirement flow. Until that gate is
implemented and verified, do not copy a managed real-account profile to another device.

The two unsafe cases remain:

| Ca | Vì sao |
|---|---|
| **Xoay vòng** giữa hai máy đều đặn | Profile cục bộ di chuyển thường xuyên làm lịch sử/locale khó đối chiếu; cần quy trình transfer có kiểm soát |
| **Cùng lúc ở hai máy** (quên xóa bản cũ) | Hai bản sao cục bộ có thể ghi request đan xen và tạo trạng thái khó truy vết; hãy giữ một bản authoritative |

Cả hai đều nằm ngoài tầm với của database, nên chỗ can thiệp là câu chữ cộng dấu vết: mỗi lần đổi
máy ghi `ACCOUNT_DEVICE_MOVED`, đủ để sau này dựng lại *"nick này từng ở máy nào, từ ngày nào"*.

**Thu hồi máy không bị chặn bởi nick đang ghim** — mất laptop là đường khẩn cấp, và bắt gỡ ghim
từng nick trước là đặt thủ tục lên trước thiệt hại. Nó gỡ ghim cả loạt trong cùng transaction rồi
nói rõ mấy nick vừa mất ghim. Sổ ở `/relay-devices` hiện số nick đang ghim ngay dưới tên máy, để
người sắp bấm biết mình đang làm gì.

Nick ghim lệch, hoặc có profile mà chưa ghim máy nào, đều nổi lên thành dải cảnh báo ở trang
**Hôm nay** — không phải bấm nút mới biết.

> **VPS thay laptop được, nhưng đừng dùng chung một VPS cho cả team.** Sổ `RelayDevice` không
> quan tâm máy là sắt hay ảo nên một VPS đăng ký y hệt một laptop. Nhưng một VPS chung là gom cả
> đàn nick về đúng một nền phần cứng thật — ngược hẳn với việc đang chi tiền cho 10 proxy riêng.
> Thêm nữa: Windows desktop chỉ cho một phiên RDP tại một thời điểm, và MKT Browser **không có chế
> độ headless**. Dùng VPS thì phải kiểm tra cấu hình/khả năng tương thích trước khi xem xét tài
> khoản thật: VPS không có GPU thật nên Chromium render bằng phần mềm, và engine pin/locale có thể
> không khớp. Tài khoản thật vẫn ngoài phạm vi pilot hiện tại.

## Facebook

Fanpage đăng bằng **Graph API chính thức** — miễn phí, hợp lệ, không bao giờ bị khóa vì vi phạm
chính sách tự động hóa. Không cần antidetect browser, không cần proxy.

**Bốn bước cấu hình** (làm một lần, khi nào cần thì làm — thiếu nó cả app vẫn chạy bình thường):

1. Tạo app ở [developers.facebook.com](https://developers.facebook.com/). Màn hình chọn use case
   phải chọn **`Other`** rồi type **`Business`**. Chọn *"Authenticate and request data from users
   with Facebook Login"* là app khóa vào nhánh chỉ có quyền cấp user — không thêm được quyền Page,
   và **không sửa được**, phải tạo app khác (chính Meta nói vậy trong hộp thoại thêm use case).
2. **Add Product → Facebook Login for Business** → tab **Configurations** → tạo một configuration
   kiểu *General*, tick đúng ba quyền `pages_show_list` + `pages_read_engagement` +
   `pages_manage_posts`. Chép lại **Configuration ID**.
3. Tab **Settings** của sản phẩm đó → khai redirect URI đúng bằng
   `http://localhost:3000/api/facebook/oauth/callback` — Facebook so từng ký tự, lệch dấu `/` cuối
   là hỏng.
4. Điền `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (App settings → Basic) và
   `FACEBOOK_LOGIN_CONFIG_ID` vào `.env`, khởi động lại dev server.

Không cần App Review: chế độ Development đủ để đăng lên Page do chính mình quản trị. Ba quyền trên
sẽ ghi *"Requires App Review"* — kệ nó, bạn là admin của chính app nên Facebook vẫn cấp.

> **Hai kiểu Facebook Login, khác nhau ở chỗ quyền khai ở đâu.** Bản thường khai bằng `scope` ngay
> trong URL; bản **for Business** khai trước trong một configuration, URL chỉ trỏ tới bằng
> `config_id`. App loại Business tạo từ 2025 chỉ thêm được bản for Business, nên phần lớn app mới
> cần `FACEBOOK_LOGIN_CONFIG_ID`. Điền biến đó vào là quyền lấy theo configuration, **không** lấy
> theo `REQUIRED_SCOPES` trong code nữa — thiếu quyền nào ở configuration thì tới lúc bấm đăng mới
> lộ ra. App cũ dựng bằng Facebook Login thường thì để trống biến này.

> ⚠️ **Kết nối Facebook phải mở app bằng đúng `http://localhost:3000`**, không phải
> `http://127.0.0.1:3000`. Trình duyệt coi hai địa chỉ này là hai host khác nhau khi lưu cookie,
> nên cookie chống CSRF đặt ở một bên không tới được bên kia và luồng kết nối hỏng. Mở nhầm địa
> chỉ thì công cụ chặn ngay từ lúc bấm nút và nói rõ phải sửa gì — không để lỗi nổ ở bước cuối.
> (Meta cũng chỉ chấp nhận `http://` cho `localhost`, nên `localhost` là chuẩn của cả dự án.)

Vào `/facebook` bấm **Kết nối nick Facebook**, đăng nhập bằng nick cá nhân đang quản trị Page.
Công cụ tự đổi token 2 giờ → token 60 ngày → lấy Page token, và **tự tạo đích đăng** cho từng
Page nên xếp lịch được ngay. Job có đích Fanpage sẽ có nút **"Đăng lên Page"** ngay trong hàng đợi.

> Ở màn hình cấp quyền nhớ **tick chọn từng Page**. Bỏ sót Page nào là Page đó không hiện ra.

> Trên Facebook nên đặt **2 nick làm quản trị viên Page**. Mất nick admin duy nhất là mất Page,
> và token đang dùng chết theo ngay lập tức.

**Token chết không báo trước** — nick admin đổi mật khẩu, gỡ app, hoặc bị Meta khóa là token
thành rác ngay, và điều đó chỉ lộ ra ở lần đăng tiếp theo. Bấm "Kiểm tra token tất cả Page"
ở `/facebook` theo thói quen, đừng đợi tới lúc cần đăng gấp.

### Group phải đăng tay — không phải thiếu tính năng

Meta gỡ quyền `publish_to_groups` tháng 04/2024. Không công cụ nào tự đăng group được nữa,
Buffer/Hootsuite/Make đều đã bỏ. Thứ tự nhận làm được chỉ có thể là lái trình duyệt giả người
dùng — đúng hành vi khiến nick bị khóa.

Bài group vẫn xếp lịch ở `/queue` với đích loại Facebook Group và **vẫn bị chấm 9 trong 10 luật**
— đúng như Reddit, trừ luật 10 vốn chỉ áp cho Reddit. Đến hạn nó hiện ở thẻ nhắc việc chung với
bài Reddit — xem [Đăng bài](#đăng-bài).

## Bảo mật

- Mật khẩu, mật khẩu email, TOTP secret, **token Facebook**: mã hóa AES-256-GCM trước khi chạm database
- `FACEBOOK_APP_SECRET` chỉ nằm ở server, không có component client nào import tới nó
- Thông báo lỗi Graph API đi qua bộ che token trước khi hiện ra hoặc ghi `AuditLog` — Graph hay
  vọng lại nguyên tham số đã gửi
- Khóa nằm ở biến môi trường, không nằm trong DB — và **khóa mở bí mật nick không nằm trên máy
  chủ**, xem [Cầu nối](#cầu-nối)
- Mật khẩu không bao giờ đi qua trang web: nó hiện ở cửa sổ nhỏ do cầu nối trên máy bạn phục vụ,
  còn trang web chỉ cầm một tấm vé đã mã hóa
- Bí mật nick được **mã hóa ngay trên máy người nhập**, trước khi form gửi đi — máy chủ nhận
  ciphertext và chỉ kiểm được hình dạng của nó
- Mọi lần lộ credential / mở profile đều ghi `AuditLog` kèm **ai** đã làm và **máy nào** nhận vé
- **Mọi server action và route handler đều đòi đăng nhập** — gác nằm ở chữ ký định nghĩa, và
  có test quét bắt buộc (xem
  [Hàng rào giờ là đăng nhập](#hàng-rào-giờ-là-đăng-nhập-không-còn-là-chỗ-app-lắng-nghe))
- **Mọi trang cũng đòi đăng nhập** — `src/proxy.ts` chặn trước khi trang kịp hỏi database
- Route `POST` trong `api/` đối chiếu `Origin` với `Host` — Next tự làm việc này cho server
  action nhưng không làm cho route handler, mà route handler chính là chỗ có nút mở profile
- `.env` và thư mục sao lưu `data/backups/` đã nằm trong `.gitignore` — bản dump chứa ciphertext

### Hàng rào giờ là đăng nhập, không còn là chỗ app lắng nghe

Trước 05/08/2026 công cụ không có màn hình đăng nhập, nên hàng rào duy nhất là chỗ nó lắng
nghe: `npm run dev` và `npm start` gắn cứng `-H 127.0.0.1` để chỉ mở được từ chính máy đó.

**Cờ đó đã bỏ**, vì hàng rào thật đã dựng xong: mọi lối vào đều đòi đăng nhập Google và đối
chiếu `ALLOWED_EMAILS` ở **mỗi request**. Đó là điều kiện đã hẹn trước cho việc bỏ cờ — công cụ
phải phục vụ được 5-6 người ở 5-6 nơi thì không thể chỉ nghe trên `localhost`.

Hàng rào đó có **hai nửa**, và thiếu nửa nào cũng vô nghĩa:

| Nửa | Gác gì | Ở đâu |
|---|---|---|
| `guardedAction` / `guardedRoute` | đường **làm**: mọi server action, mọi route handler | chữ ký định nghĩa |
| `src/proxy.ts` | đường **đọc**: mọi trang | chặn trước khi trang hỏi database |

Nửa thứ hai dễ quên nhất và từng bị quên thật: trang trong `app/` là server component tự gọi
thẳng Prisma rồi trả HTML, **không đi qua wrapper nào**. Gác đủ 35 lối vào mà không gác trang
thì chưa đăng nhập vẫn mở được `/accounts` và `/proxies` để đọc username từng nick, email gốc,
và host/port/username của từng proxy — không sửa được gì, nhưng đọc là đủ.

`proxy.ts` **kiểm phiên thật** (hỏi database rồi đối chiếu `ALLOWED_EMAILS`) chứ không chỉ ngó
xem có cookie hay không. Cách ngó cookie nhanh hơn và chạy được ở edge, nhưng nó không thấy
được người vừa bị gỡ khỏi danh sách — cookie của họ vẫn còn nguyên và vẫn hợp lệ suốt 7 ngày.
Đổi lại, nó bắt buộc phải chạy ở `runtime: "nodejs"`; để mặc định edge thì Prisma không nạp
được và **mọi trang thành 500**, không phải chỉ một trang.

Thứ giữ cho điều kiện đó không mục là một phép kiểm hình dạng mã nguồn
([guarded-entry-points.test.ts](src/lib/auth/guarded-entry-points.test.ts)): trong file
`"use server"` thì **mỗi hàm export là một endpoint POST riêng** mà người lạ gọi thẳng được nếu
biết tên, nên test bắt mọi export phải có dạng `export const x = guardedAction(...)`. Gác nằm ở
chữ ký chứ không nằm trong thân hàm — không nhánh `if` nào bỏ qua được, và thêm một action mới
mà quên gác thì test đỏ ngay chứ không lặng lẽ mở toang một lối vào.

> ⚠️ **Đừng thêm `await requireActor()` vào đầu thân hàm rồi coi là đã gác.** Dòng đó quên được
> và lách được, và phép kiểm cố ý không chấp nhận nó.

> ⚠️ Đưa app ra internet thì phải có HTTPS. Cookie phiên đặt cờ `Secure` khi
> `NODE_ENV=production`, và cookie `Secure` không bao giờ được gửi qua `http://` — chạy
> production sau một reverse proxy chỉ có HTTP là đăng nhập xong lại quay về màn hình đăng nhập,
> lặp vô tận mà không có câu lỗi nào.

### Sao lưu — hai lớp, cất hai nơi

```bash
npm run db:backup            # database của MÁY NÀY  → data/backups/mkttool-<ngày>-<giờ>.sql
npm run db:backup:remote     # hút từ MÁY CHỦ THẬT   → data/backups/mkttool-prod-<ngày>-<giờ>.sql
```

Chạy được khi app đang mở: `pg_dump` chụp ảnh trong một transaction nên bản sao luôn nhất quán,
không phải tắt server mới sao lưu được. Tên file có mốc thời gian nên **không bao giờ ghi đè
bản cũ**.

**Lệnh thứ hai là nếp sao lưu thật khi đã lên Railway.** Nó đọc `PRODUCTION_DATABASE_URL` — khai
ở `.env` của **máy bạn**, không khai trên máy chủ. Thiếu biến đó thì lệnh dừng ngay kèm hướng dẫn;
nó **không bao giờ lùi về `DATABASE_URL`**, vì làm vậy là dựng ra một file mang tên `mkttool-prod-…`
chứa dữ liệu máy dev — bản sao nói dối, và chỉ lộ ra vào ngày cần tới nó.

**Lớp không cần ai nhớ: máy chủ tự đẩy bản sao lên Cloudflare R2 mỗi đêm.** Bật bằng
`BACKUP_DAILY_AT` + bốn biến `R2_*` (cách khai ở
[database-backup-and-restore.md](docs/database-backup-and-restore.md#automated-cloudflare-r2-backups)).
Bốn biến `R2_*` phải **đủ cả bốn hoặc rỗng cả bốn** — khai một nửa thì app dừng, vì "chạy một nửa"
ở đây nghĩa là tin rằng mình có bản sao mà thật ra không.

> **Sao lưu ghi thẳng lên R2, không ghi vào `data/backups/` của máy chủ.** Trong container thư mục
> đó là **ổ tạm** — nó biến mất sau mỗi lần deploy, và một bản sao lưu chết cùng lúc với thứ nó bảo
> vệ thì tệ hơn không có, vì nó *trông như* có. Nguyên tắc chung: **bản sao không được nằm cùng nhà
> với bản gốc.** Hai lớp nằm hai nơi — R2 (tự động, hằng đêm) và `db:backup:remote` (người quản trị
> kéo về máy mình).

> **Sao lưu ổ đĩa của Railway: cố ý không dùng.** Nó đòi gói Pro $20/tháng, và bản sao của nó nằm
> **cùng tài khoản với bản gốc** — tức không chống được ca tệ nhất, đúng ca mà R2 đã phủ. Thứ nó
> thêm vào chỉ là *lỡ tay xóa / migration hỏng giữa hai lượt sao lưu đêm*, và chỗ đó bù bằng một
> nếp tay: **chạy `npm run db:backup:remote` ngay trước mỗi lần deploy có đổi cấu trúc database** —
> `prisma migrate deploy` không tự sao lưu, và đó là lúc rủi ro cao nhất.

Lượt sao lưu đêm **không hỏng lặng lẽ được**: dump rỗng thì không được tải lên mà ghi là thất bại;
`pg_dump` treo quá 10 phút thì bị giết chứ không chờ vô hạn (một tiến trình treo là kiểu hỏng tệ
nhất — không log, không dấu vết, nhìn từ ngoài giống hệt "chưa tới giờ hẹn"); và trang **Hôm nay**
kêu đỏ trong cả ba ca: lượt gần nhất hỏng, bản mới nhất quá 2 ngày tuổi, hoặc bật rồi mà chưa chạy
lần nào.

Mỗi lượt sao lưu in ra **số hàng dữ liệu và số bảng có dữ liệu**, và nói thẳng khi con số là 0.
Không thừa: `pg_dump` chạy trên một database **rỗng** vẫn cho ra file `.sql` hợp lệ, đủ cấu trúc
bảng, và mọi câu "✅ đã sao lưu" đều đúng. `PRODUCTION_DATABASE_URL` trỏ nhầm sang một Postgres
mới dựng là ra đúng cảnh đó — mà bản sao lưu là thứ chỉ được kiểm chứng vào ngày muộn nhất có thể.

Bản sao là SQL dạng chữ (`--format=plain`) chứ không phải dạng nén, dù dạng nén nhỏ hơn. Vì bản
sao phải **đọc được bằng mắt** để kiểm "không có credential dạng trần" — quét chuỗi trên file nén
thì luôn không thấy gì, tức là một phép kiểm an toàn luôn xanh, kiểu hỏng tệ nhất của một phép
kiểm. `npm run vault:smoke` chạy đúng phép quét đó trên bản dump thật.

Khôi phục vào một database rỗng mới (đừng nạp đè lên database đang có dữ liệu):

```bash
createdb -U postgres mkttool_restore
psql -U postgres -d mkttool_restore -f data/backups/mkttool-<ngày>-<giờ>.sql
```

Rồi trỏ `DATABASE_URL` sang database vừa khôi phục.

> Bản sao lưu và **hai khóa vùng** là các nửa của cùng một thứ. Có bản sao mà mất khóa thì mở
> ra chỉ thấy chuỗi vô nghĩa; có khóa mà mất bản sao thì chẳng còn gì để mở. Cất mỗi thứ một
> nơi — để chung là đưa cả ổ lẫn chìa cho người nhặt được. Khóa operator nằm ở máy operator,
> nên khôi phục mật khẩu nick từ bản sao lưu của máy chủ **bắt buộc phải có khóa từ máy đó**.

### Khóa bị lộ thì xoay, không phải nhập lại từ đầu

Lỡ commit `.env`, lỡ dán khóa vào chat, máy nghi bị xâm nhập:

```bash
npm run vault:keygen                                              # sinh khóa mới
npm run vault:rekey -- --domain=server --new-key=<hex>            # THỬ: giải mã hết, không ghi gì
npm run vault:rekey -- --domain=server --new-key=<hex> --apply    # tự sao lưu rồi ghi đè
```

`--domain` là **bắt buộc**: kho có hai vùng khóa, mỗi lượt xoay đúng một vùng. `server` là mật
khẩu proxy + token Facebook; `operator` là mật khẩu / email / TOTP của nick. Lộ khóa nào thì
xoay vùng đó — không phải xoay cả kho.

Lượt `--apply` giải mã sạch toàn bộ **trước khi** ghi bất cứ thứ gì, tự sao lưu, rồi ghi trong
một transaction. Một bản ghi hỏng là dừng cả mẻ — database xoay khóa được một nửa thì không
khóa nào mở nổi nữa.

Xong lệnh **chưa phải là xong**: phải tự sửa biến khóa của vùng đó trong `.env`, khởi động lại
app, rồi mở một nick bấm copy mật khẩu để kiểm. Giữ khóa cũ tới khi kiểm xong — bản sao lưu vừa
tạo vẫn mã hóa bằng khóa cũ.

### WebRTC — installer bắt buộc và launch fail closed

JavaScript spoofing và cờ Chromium không đủ ngăn STUN UDP lộ IP operator trong packaged Chrome for
Testing. Bộ cài Windows nay yêu cầu một lần Administrator approval để cài hai outbound UDP block
rules riêng cho CFT và CloakBrowser tại đường dẫn runtime ổn định, không chứa số phiên bản.

Mỗi lần mở profile có proxy, MKT Browser kiểm đúng executable, rule, protocol, direction, action và
cả ba Windows firewall profiles trước khi mở website. Không cài hoặc không xác minh được protection
thì profile không launch. Không cần và không nên tạo rule PowerShell thủ công sau update. CFT và
CloakBrowser phải được human-test riêng; kết quả an toàn của engine này không chứng minh engine kia.

## Dò shadowban

Shadowban im lặng: bài vẫn hiện với chính mình, người ngoài không thấy gì. Không đo thì ba tháng
sau mới phát hiện cả cụm đã chết.

`npm run health` mở trang profile công khai của từng nick ở chế độ **chưa đăng nhập**, qua một
**proxy quan sát viên riêng**, rồi đối chiếu số bài thấy được với số bài đã đánh dấu đã đăng.
Kết quả vào bảng ở `/health` và trang chủ, kèm biểu đồ karma 30 ngày.

| Đo được gì | Kết luận |
|---|---|
| Reddit trả HTTP 404 cho trang profile | **Bị ẩn** — nhưng xem cảnh báo ngay dưới bảng |
| Profile hiện ra, nhưng 0/N bài đã đăng nhìn thấy được | **Bị ẩn** — kiểu ẩn từng bài |
| Thấy dưới một nửa số bài đã đăng | **Nghi ngờ** — có thể chỉ là mod xóa bài |
| Trang báo tài khoản bị treo | **Dính checkpoint** |
| **Thấy nhiều bài hơn số đã ghi trong kho** | **Có bài chưa ghi** — bộ luật đang đếm thiếu |
| Bộ dò bị captcha / Reddit đổi HTML | **Không dò được** — *không phải* tin tốt |
| Profile bình thường, nhưng chưa bài nào đánh dấu đã đăng | **Chưa đối chiếu được** — cũng *không phải* tin tốt |

**"Có bài chưa ghi" là kết luận về SỔ SÁCH, không phải về nick** — nên nó không cách ly nick.
Nhưng đừng bỏ qua: bộ luật đếm theo job, nên mỗi bài không được ghi làm luật hạn mức ngày, giãn
cách cùng đích, tỷ lệ promo và chặn đụng độ thread **đều dễ dãi hơn thực tế**. Bài bị ẩn thì mất
reach; bài không được ghi thì bộ luật lặng lẽ cho qua những bài lẽ ra phải chặn — và đó mới là
đường dẫn tới shadowban. Kể cả bài đăng tay để nuôi nick hay bài của chủ cũ khi mua nick cổ cũng
nên ghi.

Bộ dò đọc `data-permalink` của từng bài nên chỉ được **đích danh bài nào** chưa ghi, và job nào
khai đã đăng mà không thấy bài. Khóa sinh bằng đúng `normalizeThreadUrl()` mà luật 8 dùng, nên
hai bên ghép được với nhau.

Hai kết luận cuối bảng đều có nghĩa "chưa biết", chỉ khác nguyên nhân: **Không dò được** là bộ
dò hỏng, **Chưa đối chiếu được** là bộ dò chạy ngon nhưng không có gì để so. Nick mới hoặc đang
nghỉ thì đó là bình thường; nhưng nick đăng đều mà không ai bấm **"Đã đăng"** cũng rơi vào đúng ô
này — và đó mới là lúc cần cảnh báo nhất. Cả hai đều làm luật 10 cảnh báo, không cho qua im lặng.

> ⚠️ **404 có bốn nguyên nhân, và Reddit trả về cùng một trang cho cả bốn:** nick bị ẩn toàn
> cục, **username khai sai trong kho**, nick đã bị xóa, nick chưa từng tồn tại. Kiểm chính tả
> username trước khi tin kết luận — lượt dò thật đầu tiên (04/08/2026) đã cách ly nhầm một nick
> khỏe đúng vì lý do đó.
>
> Bộ dò dùng lịch sử dò để thu hẹp: **đã từng đọc được** profile này rồi mà giờ mất thì loại trừ
> được khả năng gõ sai, và lúc đó nó mới nói chắc. Chưa từng thấy lần nào thì câu chữ nói rõ là
> chưa loại trừ được gì.
>
> Dù nguyên nhân nào thì nick **vẫn bị cách ly** — cách ly nhầm một nick khỏe thì ồn ào và sửa
> được bằng tay, còn để một nick đã bị ẩn đăng tiếp thì im lặng và tốn content mỗi ngày.

Nick bị kết luận **Bị ẩn** hoặc **Dính checkpoint** sẽ tự chuyển trạng thái và bộ luật chặn mọi
job của nó. Chiều ngược lại thì không: một lần dò khỏe **không** tự gỡ cách ly, vì nó chỉ chứng
minh lần dò đó không thấy vấn đề. Gỡ là quyết định của người, ở trang chi tiết nick.

> ⚠️ **Proxy quan sát viên phải là IP riêng, không bao giờ đăng nhập nick nào.** Dò bằng chính
> proxy của nick là tự nhìn mình trong gương rồi kết luận người ngoài cũng thấy vậy. Nhập ở
> `/proxies`, khối "Proxy quan sát viên". Chưa có thì bộ dò dừng ngay từ đầu — cố ý, vì dò bằng
> IP nhà còn tệ hơn không dò, và trang **Hôm nay** sẽ nói thẳng là chưa chạy được vì thiếu nó.

Chỉ nhận proxy **HTTP**: Chromium không xác thực được với SOCKS5, nó bỏ qua user/mật khẩu rồi
đi tiếp — hoặc hỏng, hoặc tệ hơn là chạy bằng IP nhà mà không ai biết.

> **Mua ở đâu — ràng buộc lúc thay proxy này, đừng bỏ.** Bản đang dùng (`Observer1`, 06/08/2026)
> là **ISP tĩnh của IProyal**, cố ý **khác nhà cung cấp** với 10 proxy Webshare gắn nick. Mua cùng
> chỗ với proxy của nick là tự nối con mắt quan sát về đúng cái nguồn nó phải giả vờ không quen:
> dải IP gần nhau, cùng ASN, cùng dấu vết mua bán. Nó không hỏng ngay, nó chỉ làm lời chứng của bộ
> dò yếu đi mà không có gì báo.
>
> ISP tĩnh có **IP ra trùng IP khai** — bình thường, khác residential xoay vòng (vào cổng chung,
> ra một IP khác). Thấy hai số trùng nhau ở nút *Kiểm* thì đó không phải lỗi.

Proxy quan sát viên **kiểm được bằng nút "Kiểm"** ngay trong khối đó, dùng chung bộ kiểm với
proxy thường (xem [Proxy được kiểm trước khi mở](#proxy-được-kiểm-trước-khi-mở)). Nên bấm trước
mỗi lượt dò quan trọng: proxy này chết thì mọi nick ra kết luận *Không dò được* — trung thực
nhưng vô dụng, và người đọc sẽ đi tìm lỗi ở phía Reddit.

### Bốn cách chạy một lượt dò

| Cách | Dùng khi |
|---|---|
| **Lịch hằng ngày** | nếp thường. Máy chủ tự chạy một lượt mỗi ngày — xem [Lịch dò hằng ngày](#lịch-dò-hằng-ngày) |
| Nút **"Dò cả đàn"** ở `/health` | muốn chạy ngay mà không mở terminal. Chạy nền ở tiến trình riêng — đóng tab không ảnh hưởng, tải lại trang thì bảng đầy dần |
| `npm run health` | chạy tay từ terminal, ví dụ khi đang soi một lỗi |
| Nút **"Dò lại ngay"** ở từng dòng | soi lại đúng một nick đáng ngờ |

Cả bốn đường sinh **đúng một tiến trình `tsx scripts/run-health-check.ts`**, không phải bốn bản
sao của luồng dò — nên chúng không thể lệch nhau.

Lượt đầy đủ nghỉ **ngẫu nhiên 30-90 giây giữa các nick**, nên 8 nick mất gần mười phút. Đó là
chủ ý: tám lượt xem profile bắn ra trong ba giây từ một IP là hành vi của máy, và chính bộ dò
sẽ bị chặn trước tiên.

**Hai lượt dò không bao giờ chạy chồng nhau.** Lượt đang chạy giữ một hàng trong bảng
`HealthCheckLock`; lượt thứ hai bị từ chối kèm câu nói rõ **máy nào**, tiến trình nào đang giữ và
giữ bao lâu rồi. Khóa nằm trong database chứ không phải trong file hay trong bộ nhớ vì từ khi lên
máy chủ nó phải bắc qua **ba nơi** — lịch trên máy chủ, nút bấm trong web app, và `npm run health`
gõ ở máy một người nào đó — mà ba nơi đó không nhìn thấy hệ thống tệp của nhau. Tiến trình bị tắt
ngang để lại khóa mồ côi thì sau 30 phút lượt sau tự giành lấy.

### Lịch dò hằng ngày

Khai `HEALTH_CHECK_DAILY_AT="09:00"` (giờ team) trong biến môi trường **của máy chủ** là bộ dò tự
chạy mỗi ngày một lần. Trạng thái hiện ở khối **"Lịch dò hằng ngày"** ngay trang `/health`: giờ
hẹn, lượt gần nhất lúc nào, và lượt đó đã bắn hay bị bỏ qua vì lý do gì.

**Vắng biến này là lịch TẮT**, và đó là mặc định. Cố ý: máy dev nào cũng trỏ vào một database
thật, nên lịch tự bật sẵn nghĩa là mỗi người mở máy lại bắn một lượt dò tiêu quota proxy quan sát
viên. Máy chủ chạy production mà chưa khai thì khay cảnh báo vận hành nhắc ADMIN; khai sai dạng
thì nó kêu đỏ chứ **không** lặng lẽ coi như tắt.

Bốn điều nên biết về cách nó cư xử:

| Tình huống | Nó làm gì |
|---|---|
| App tắt lúc tới giờ hẹn, bật lại lúc 21:00 | chạy bù **một** lượt ngay, dù lỡ mấy ngày cũng chỉ bù một |
| Deploy lại lúc 09:05, ngay sau lượt 09:00 | **không** chạy lại — mốc lượt gần nhất nằm trong database, không nằm trong bộ nhớ |
| Đang có người bấm "Dò cả đàn" đúng lúc đó | bỏ qua, và ghi rõ *"lượt đó đã đủ số liệu cho hôm nay"* |
| Chưa có proxy quan sát viên nào bật | bỏ qua kèm lý do, **không** thử lại mỗi phút — thứ đang chặn cần một người sửa |

> **Vì sao không dùng cron của Railway.** Cron của hãng chỉ nhận giờ **UTC**, mà giờ hẹn phải theo
> `TEAM_TIMEZONE`. Khai bằng cron nghĩa là cùng một giờ hẹn nằm ở hai nơi, và đổi múi giờ team mà
> quên sửa chuỗi cron là dò sai giờ **mà không có gì báo** — đúng họ hỏng với `pg_dump` lệch major
> và luật firewall WebRTC. Thêm nữa: cron là cấu hình riêng của từng hãng, mà cả ảnh Docker dựng
> ra để chạy được ở nhiều hãng bằng cùng một file.

Ảnh chụp màn hình **chỉ giữ khi kết luận khác "khỏe"**, và tự xóa sau 30 ngày ở cuối mỗi lượt
dò. Bản ghi kết luận thì giữ nguyên vĩnh viễn — đó là thứ vẽ ra xu hướng karma và cho biết nick
chuyển xấu từ lúc nào.

> Bộ dò đọc HTML của `old.reddit.com`. Reddit đổi giao diện là nó hỏng — và khi hỏng thì nó báo
> **"Không dò được"** chứ không bao giờ báo "khỏe". `npm run health:smoke` chạy đối chiếu với
> Reddit thật (không cần nick, không cần proxy) nên đó là thứ chạy đầu tiên khi thấy kết quả lạ.

## Việc chưa làm

- **Browser/Relay rollout gates:** live vendor session/schema integration, real proxy/DNS/WebRTC
  evidence, human-controlled login/input, second-PC setup/recovery, and the canary. Packaged
  crash/reboot recovery and Relay v16 spent-ticket restart recovery are verified locally, but do not close
  these remaining rollout gates.
- **TikTok publishing:** content, scheduling, warmup, and posting automation remain parked; only the
  account/profile/manual-browser workflow is available for controlled technical checks. Identity
  isolation and real-account rollout are not approved.
- **Semi-automated Reddit posting:** Phase 05 has not started; the operator still performs the final
  posting action.

## Đã kiểm chứng bằng thực tế

| Việc | Ngày | Bằng chứng |
|---|---|---|
| Mở profile antidetect | 02/08/2026 | Chặng B |
| Đẩy proxy vào profile, IP khớp | 02/08/2026 | [Chặng C](plans/reports/chang-c-260802-1443-proxy-push-verification.md) |
| Dò shadowban đọc Reddit thật | 03/08/2026 | `npm run health:smoke` 17/17, bắt được 2 lỗi parser |
| Kiểm proxy còn sống qua chính proxy đó | 04/08/2026 | 10/10 proxy Webshare ra đúng IP và đúng quốc gia; nhánh SOCKS5 và nhánh HTTP trên cùng một proxy cho cùng một IP |
| **Đăng thật lên Fanpage qua Graph API** | **03/08/2026** | Bài lên tường Page nháp; job `POSTED` kèm URL thật, `Interaction` tự ghi, `AuditLog` ghi `FACEBOOK_PAGE_PUBLISHED` |
| **Web chạy thật trên Railway** | **06/08/2026** | Đăng nhập Google vào được, 10 proxy sang đủ, lịch dò tự bắn đúng 09:00 giờ team, đẩy commit lên `master` là web tự cập nhật |
| **Sao lưu tự động lên R2 đi trọn vòng** | **06/08/2026** | App đẩy object 35 KB lên R2 → tải về → `psql -f` với `ON_ERROR_STOP=1` vào database rỗng: exit 0, **22 hàng trong 6 bảng**, khớp từng số với dòng log |

| **Proxy quan sát viên sống trên máy chủ thật** | **06/08/2026** | `Observer1` (US) — **ISP tĩnh của IProyal, khác nhà cung cấp với 10 proxy Webshare của nick**. Kiểm lúc 15:31: proxy sống và **IP ra khác IP máy vận hành**, tức bộ dò đã có một con mắt người ngoài thật để nhìn Reddit |

Chưa kiểm chứng: đăng bằng nick Reddit thật (Phase 05 chưa làm), và **một lượt dò với nick thật**.
Proxy quan sát viên đã có và đã kiểm sống; thứ còn thiếu là nick Reddit trong kho **trên máy chủ**
— thuộc bước nhập liệu của GĐ6.
