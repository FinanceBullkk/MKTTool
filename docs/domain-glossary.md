# Từ điển thuật ngữ nghiệp vụ

**Updated:** 30/08/2026

Bộ luật an toàn là tri thức nghiệp vụ được mã hóa thành code. Tài liệu này giải thích
từng khái niệm để 6 tháng nữa vẫn hiểu vì sao ngưỡng Jaccard là 0.70 chứ không phải 0.85.

Mỗi mục: **thuật ngữ → định nghĩa → vì sao quan trọng → nơi xuất hiện trong code.**

Tra cứu thêm: [mục lục tài liệu](README.md) · [tài liệu sản phẩm](project-overview-pdr.md) · [bản đồ mã nguồn](codebase-summary.md) · [README](../README.md)

---

## Danh tính

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Nick / account** | A Reddit, Facebook, or TikTok account. Browser-backed Reddit/TikTok accounts bind 1:1 to a static proxy, profile configuration, and Relay device for the controlled local workflow; API-only Facebook Page administrators may omit those browser fields. This data binding is not proof of browser identity isolation. | Prevents a new platform from silently inheriting the wrong configuration or posting rules while keeping the beta operator-controlled. | `prisma/schema.prisma` → model `Account`; `account-readiness.ts` |
| **Giọng viết + mảng nội dung** | Hai câu ghi chú trên chính nick: nó nói kiểu gì, nó viết về cái gì. | Cú hích **trước khi viết**: người ôm mười nick mà không có gì nhắc làn thì viết cả mười bài bằng giọng tự nhiên của mình, rồi bị luật 7 chặn ở phút cuối. **Lưu ý:** bộ luật KHÔNG đọc hai cột này — luật 7 so trùng văn bản thật, xét mọi nick cùng họ nền tảng. Thiếu thì `describeAccountReadiness()` báo `NO_VOICE`. | `schema.prisma` → `Account.voice`, `Account.contentAngle` |
| **Vân tay (fingerprint)** | Các trường do provider khai báo cho cấu hình trình duyệt (ví dụ device family, locale, timezone, screen và những bề mặt runtime mà provider quản lý). | Dùng để căn cấu hình theo proxy và phát hiện lệch cấu hình; không được suy ra rằng các profile có full-surface tuple khác nhau hoặc đã đạt identity isolation. | Do antidetect browser quản lý, MKTTool chỉ lưu `antidetectProfileId` và các trường được provider trả về |
| **Antidetect browser** | A desktop application that provides local browser profiles and provider-controlled configuration. MKT Browser is the current Relay target for the controlled Windows pilot; AdsPower remains a secondary adapter. | It supplies profile-local storage and configuration controls. It is not, by itself, evidence that browser identity is isolated across profiles. | `src/lib/antidetect/` |
| **MKT Browser** | The separate MultiZen-derived desktop fork for MKTTool. W02 owns its first-party package/preload/MCP contract on configurable default port `47822`; Windows x64 is the only v1 and team-demo platform, macOS is deferred to MKB-07, and v1 retains upstream UX/UI. | It provides the managed technical boundary for the pilot; native engine ownership and full-surface identity isolation remain separate, open gates. | `plans/260810-0244-mkt-browser-noi-bo/plan.md` |
| **Browser engine** | The Chromium-derived binary that actually runs sites, separate from the MKT Browser application layer. | MIT application source does not grant engine redistribution rights; app and engine require separate version/license approval. | MKT Browser `ChromiumBootstrap`; MKB-00 evidence |
| **Profile** | Một instance trình duyệt bên antidetect browser, gắn 1:1 với nick qua `antidetectProfileId @unique`. | Ép bằng ràng buộc DB — hai nick chung profile là không thể; đây là ràng buộc dữ liệu, không phải bằng chứng cô lập danh tính. | `schema.prisma` → `Account.antidetectProfileId` |
| **Cụm nick** | Tập hợp mọi nick do cùng một người vận hành (tức toàn bộ nick trong database). | Bộ luật coi mọi nick trong DB là "của mình" khi kiểm tra đụng độ. | Ngầm định trong `rule-context-queries.ts` |
| **Email gốc** | Email đi kèm lúc mua nick, dùng để khôi phục mật khẩu. Mã hóa trước khi lưu. | Mất email = mất quyền khôi phục nick. | `Account.emailAddress`, `Account.emailPasswordEnc` |
| **TOTP secret** | Khóa bí mật sinh mã OTP cho 2FA. Mã hóa AES-256-GCM trước khi lưu. | Thiếu TOTP thì không đăng nhập được khi bật 2FA. | `Account.totpSecretEnc`; `src/lib/totp/` |

## Mạng

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Proxy tĩnh (static ISP)** | Còn gọi **static residential ISP**. IP dân dụng **cố định**, thuê theo IP chứ không theo dung lượng. Đây là loại được chọn cho controlled browser workflows — Phase 00 khuyến nghị IPRoyal Static Residential ISP. | IP không đổi giúp giữ route ổn định để đối chiếu; nó không làm tài khoản giống người thật và không chứng minh identity isolation. | `schema.prisma` → `Proxy` (type `STATIC_ISP`) |
| **Proxy xoay (rotating residential)** | IP dân dụng nhưng **đổi liên tục**, tính tiền theo GB. | **Đây mới là loại bị loại bỏ**, không phải "residential" nói chung. IP đổi liên tục phá ràng buộc 1 nick : 1 IP, và bản cũ tính ra ~5,4 triệu/tháng tiền băng thông. | `docs/archive/` |
| **Proxy datacenter** | IP thuộc trung tâm dữ liệu, rẻ, dễ bị nhận diện là máy chủ. | Chỉ dùng test kỹ thuật (xem profile có ăn đúng IP không). Đưa nick thật vào = giết nick. | Cảnh báo trong `README.md` và `project-overview-pdr.md` |
| **Proxy mobile** | IP từ mạng di động. | Tùy chọn thay thế cho static ISP. | `Proxy.type` cho phép giá trị `MOBILE` |
| **Proxy quan sát viên (observer proxy)** | Proxy riêng, TUYỆT ĐỐI không đăng nhập nick nào. Dùng để dò shadowban từ góc nhìn người ngoài. | Phải dùng IP khác, nếu không nền tảng thấy cùng IP vừa đăng vừa kiểm tra. | `schema.prisma` → `ObserverProxy` |
| **Dải /24** | 256 IP liền kề chia sẻ 24 bit đầu. | Hai nick dùng IP cùng /24 vẫn có thể bị gắn cờ — nên mua proxy từ nhiều /24 khác nhau. | Kinh nghiệm vận hành, chưa có code ép |
| **ASN** | Autonomous System Number — định danh nhà cung cấp mạng. | Nền tảng check ASN để phân biệt IP dân dụng vs datacenter. | Chưa kiểm tra tự động |
| **SOCKS5 bridge** | Đường hầm SOCKS5 để DNS phân giải từ xa (qua proxy, không qua máy cục bộ). | Nếu DNS phân giải tại chỗ, nền tảng thấy DNS không khớp IP → nghi ngờ. | Provider desktop `create_profile`/`update_profile` |

## Vòng đời nick

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Cold-start** | 14 ngày đầu sau khi mua nick: chỉ đọc, cấm đăng. | Nick mới hoạt động mạnh ngay bị soi. Đây là đồng hồ thực, không rút ngắn được. | `Account.coldStartUntil`; `rule-account-health.ts` |
| **Trạng thái nick** | `COLD_START` → `ALIVE` → `CHECKPOINT` / `SHADOWBANNED` / `DEAD`. | Luật 1 chặn mọi nick không ở trạng thái `ALIVE`. | `Account.status`; `src/lib/accounts/account-status.ts` |
| **Karma** | Điểm uy tín trên Reddit (upvote − downvote). | Nhiều sub đòi karma tối thiểu; thiếu thì AutoModerator gỡ bài im lặng. | `Account.karma`; `rule-target-eligibility.ts` |
| **Tuổi nick** | Số ngày kể từ khi nick được tạo trên nền tảng. | Một số sub đòi nick tối thiểu X ngày tuổi. | `Account.platformCreatedAt`; `account-status.ts` → `accountAgeInDays()` |
| **Checkpoint** | Nền tảng nghi ngờ nick, đòi xác minh (captcha, số điện thoại…). | Gặp checkpoint = nick ĐÃ bị nghi. Tự giải để chui vào tiếp biến cảnh báo mềm thành khóa vĩnh viễn. | `Account.status = "CHECKPOINT"` |
| **Shadowban** | Bài đăng không hiển thị với người khác nhưng chủ nick vẫn thấy. Có hai loại: toàn cục (cả nick) và từng bài (AutoModerator gỡ im lặng). | Shadowban toàn cục thì dừng đăng. Shadowban từng bài thì phải tìm nguyên nhân (link? karma? content?). | `Account.status = "SHADOWBANNED"`; Phase 03 sẽ dò tự động |

## Nội dung & hàng đợi

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Đích đăng (target)** | Subreddit, Fanpage, hoặc Group — nơi bài sẽ được đăng. Kèm luật riêng (min karma, min tuổi, tỷ lệ promo, cho link không). | Mỗi đích là một "sân chơi" có luật riêng, bộ luật phải biết. | `schema.prisma` → `PlatformTarget`; `src/app/targets/` |
| **Content VALUE vs PROMO** | `VALUE` = bài hữu ích cho cộng đồng. `PROMO` = có nhắc sản phẩm/dịch vụ. | Phân loại này quyết định luật tỷ lệ 9:1 có áp không. | `ContentItem.type`; `src/lib/content/content-types.ts` |
| **Job** | Một lần đăng đã xếp lịch: content + nick + đích + giờ. | Đơn vị nhỏ nhất để bộ luật chấm điểm. | `schema.prisma` → `PostJob` |
| **Trạng thái job** | `PENDING` (chờ đăng) · `BLOCKED` (bị luật chặn) · `POSTED` (đã đăng) · `FAILED` (lỗi) · `SKIPPED` (bỏ qua). | Chỉ job `PENDING` và `POSTED` chiếm chỗ trong lịch — dùng để đếm hạn mức, tỷ lệ promo, so trùng. | `PostJob.status`; `content-types.ts` → `ACTIVE_JOB_STATUSES` |
| **Tương tác (interaction)** | Mọi lần nick chạm vào một thread: đăng bài, bình luận, upvote. | Dữ liệu này nuôi luật đụng độ thread (luật 8). Không ghi thì luật không có gì để so. | `schema.prisma` → `Interaction` |
| **Ghi đè (override)** | Người dùng bỏ qua cảnh báo/chặn, bắt buộc nhập lý do, ghi `AuditLog`. | Cho phép linh hoạt nhưng để lại dấu vết. Luật 8 KHÔNG cho ghi đè. | `PostJob.overrideReason`; `rules-engine.ts` → `overridable` |
| **Platform family** | Groups account/target values as `REDDIT`, `FACEBOOK` (Page + Group), or `TIKTOK`. TikTok is a valid account family for technical profile records but intentionally not a posting target. | Similarity checks stay within one family, while adding a TikTok account cannot accidentally enable its parked queue or publishing pipeline. | `src/lib/platforms/platform-family.ts` → `PLATFORM_FAMILIES`, `TARGET_PLATFORMS` |

## Bộ luật

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Tỷ lệ 9:1** | Cứ 1 bài quảng cáo đòi 9 bài hữu ích tại cùng đích. Mặc định `promoRatio = 9` trên `PlatformTarget`. | Hầu hết sub ngách áp tỷ lệ này. Vi phạm thì mod soi cả cụm nick. | `rule-promo-ratio.ts`; `PlatformTarget.promoRatio` |
| **Tỷ lệ trượt** | Cách đếm promo: bài quảng cáo thứ N đòi N × ratio bài hữu ích. Không phải "đủ 9 bài một lần rồi thôi". | Đếm kiểu một lần cho phép spam vô hạn sau 9 bài đầu. | `rule-promo-ratio.ts` → `required = (promoCount + 1) * ratio` |
| **Đụng độ thread** | Hai nick cùng chủ chạm vào một thread (bài viết). | Tín hiệu phối hợp rõ nhất mà nền tảng bắt được. Luật 8, **không cho ghi đè**. | `rule-thread-collision.ts` |
| **Trigram Jaccard** | So độ giống hai bài bằng Jaccard trên tập trigram ký tự (chuỗi 3 ký tự liền). | Chạy micro giây, không cần mạng, bắt được bài copy-paste sửa vài chữ. Bài viết lại hoàn toàn cùng ý thì lọt — chấp nhận. | `content-similarity-calculator.ts` |
| **Chuẩn hóa văn bản** | Bỏ dấu tiếng Việt (NFD + xóa combining marks), hạ thường, `đ→d`, bỏ ký tự đặc biệt. | Hai bài chỉ khác dấu câu hay viết hoa phải cho ra cùng chuỗi khi so trùng. | `text-normalizer.ts` → `normalizeText()` |
| **Verdict ALLOW/WARN/BLOCK** | Kết quả mỗi luật. **ALLOW/WARN**: lưu job bình thường, không cần làm gì thêm — WARN chỉ là lời nhắc. **BLOCK**: nút lưu khóa lại, muốn qua phải nhập lý do ghi đè (trừ luật 8, không có đường vòng). | UI hiện checklist đầy đủ mọi luật đã chạy để người dùng thấy hết vấn đề trong một lần, không phải sửa xong lại lòi ra lỗi tiếp. Luật không áp dụng cho nền tảng đó cũng nêu tên riêng, không giấu. | `rule-types.ts` → `RuleVerdict`; `post-job-actions.ts` |
| **Ngưỡng (`RuleConfig`)** | Bảng key-value trong DB, ghi đè ngưỡng mặc định mà không cần sửa code. | Siết/nới nhanh khi có dữ liệu thật, không cần build lại. | `schema.prisma` → `RuleConfig`; `rule-thresholds.ts` |

## Kỹ thuật

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **MCP** | Model Context Protocol used by Relay to call authenticated desktop tools over loopback. The W02 endpoint defaults to `127.0.0.1:47822/mcp`. | It separates Web from app/engine details while preserving human handoff on the operator device. | `mkt-browser-mcp-client.ts`; `mkt-browser-contract.ts` |
| **CDP** | Chrome DevTools Protocol, the lower-level Chromium control protocol. | MKT Browser does not expose a required external CDP endpoint; AdsPower may return one. | `antidetect-browser-adapter.ts` → optional `cdpEndpoint` |
| **Human handoff** | Stop at 2FA/CAPTCHA so a person can continue in the correct profile. | MKT Browser must preserve this boundary and never solve CAPTCHA automatically. | `project-overview-pdr.md`; MKT Browser plan |
| **Behavioral injection** | Browser-engine behavior such as movement, scrolling, and timing inherited from the upstream runtime. | It is compatibility/runtime behavior only; it does not establish identity isolation, bypass platform controls, or replace posting-safety rules and human review. | MKT Browser runtime |
| **Graph API** | API chính thức của Meta. Đường đăng Fanpage **duy nhất** được dùng ở đây: miễn phí, hợp lệ, không bao giờ bị khóa vì vi phạm chính sách tự động hóa. | Khác hẳn Reddit — Reddit không có đường API dùng được nên phải qua trình duyệt. | `src/lib/facebook/facebook-graph-client.ts` |
| **User token / Page token** | OAuth trả về *user token* của nick cá nhân; từ nó lấy ra *Page token* cho từng Fanpage. Page token là thứ dùng để đăng. | **Page token thừa hưởng tuổi thọ của user token sinh ra nó** — đây là quan hệ quyết định toàn bộ thiết kế `FacebookConnection` → `FacebookPage`. | `facebook-oauth-flow.ts`; `schema.prisma` |
| **Long-lived token** | Token 60 ngày, đổi từ token ngắn hạn 2 giờ bằng `grant_type=fb_exchange_token`. | Bỏ bước đổi này thì trưa hôm sau công cụ ngừng đăng mà không rõ vì sao. Page token sinh từ long-lived token thì **không có hạn**. | `facebook-oauth-flow.ts` → `exchangeForLongLivedToken()` |
| **`publish_to_groups`** | Quyền cho phép tự đăng vào Facebook Group. **Meta xóa khỏi mọi phiên bản Graph API từ 04/2024.** | Group bắt buộc đăng tay. Mọi tool nhận làm được đều đang lái trình duyệt giả người dùng — đúng hành vi khiến nick chết. | Ghi rõ lý do ở `schema.prisma`, `facebook-publish-action.ts`, trang `/facebook` |
| **Chế độ Development (Meta App)** | Trạng thái mặc định của app mới tạo, chưa qua App Review. | **Đủ dùng** để đăng lên Page do chính mình quản trị — không phải nộp hồ sơ duyệt. Chỉ xin đúng 3 quyền, xin thừa là tự chuốc App Review. | `facebook-app-config.ts` → `REQUIRED_SCOPES` |

---

## Bảo mật & nhiều người dùng chung

Từ vựng của bước biến công cụ một máy thành web chung cho 5-6 người ở 5-6 nơi. Câu hỏi nền của cả
nhóm này: **chiếm được máy chủ thì lấy được gì?** Đáp án phải là *không một mật khẩu nick nào*.

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Hai vùng khóa** | Kho credential mã hóa bằng **hai** khóa rời: `VAULT_KEY_SERVER` (mật khẩu proxy, token Facebook) và `VAULT_KEY_OPERATOR` (mật khẩu, email, TOTP của nick). | Đích đến là khóa operator **không nằm trên máy chủ**. Một khóa thì chiếm được máy chủ là mở được cả kho; hai khóa thì phần đắt nhất — kho danh tính — vẫn đóng. Vùng của từng cột khai ngay trong `schema.prisma` bằng `vault:server` / `vault:operator`, và có test đọc thẳng schema nên khai thiếu là đỏ. | `src/lib/crypto/encrypted-field-registry.ts`; `npm run vault:rekey -- --domain=…` |
| **Cầu nối (relay)** | Chương trình nhỏ chạy nền trên **máy của người vận hành**, nghe ở `127.0.0.1:47821`. Nó giữ `VAULT_KEY_OPERATOR` và là chỗ duy nhất mở được bí mật nick. | Đây là thứ làm hai vùng khóa có tác dụng thật. Máy chủ kiểm phiên, kiểm chủ nick, ghi nhật ký; **mở ciphertext, hiện mật khẩu, đẩy proxy, mở trình duyệt** là việc của cầu nối. | `relay/src/`; `src/lib/relay/`; `RELAY_PORT` |
| **Vé (ticket)** | Chuỗi đã mã hóa cho **riêng một chiếc máy**, sống 30 giây, tiêu được đúng một lần. Trình duyệt chỉ chuyển tay, không đọc được gì bên trong. | Là hình thức duy nhất máy chủ còn đưa được thứ gì cho ai. Mở devtools lúc bấm nút thì tấm vé là tất cả những gì thấy được. Bốn loại: lấy credential, lấy OTP, mở profile, tạo profile. | `src/lib/tickets/`; `TICKET_LIFETIME_MS`, `TICKET_KINDS` |
| **Bọc vé (sealed box)** | Ruột vé mã hóa cho đúng máy nhận: cặp khóa dùng một lần cho mỗi vé → X25519 → HKDF → AES-256-GCM. | Máy chủ giữ hộ cái hộp mà **mở không nổi**. Cũng là cơ chế chuyển `VAULT_KEY_OPERATOR` sang máy mới mà không ai phải chép một chuỗi hex nào. | `ticket-sealed-box.ts` |
| **Khóa ký vé (Ed25519)** | Cặp khóa của máy chủ, ký phủ lên cả bao ngoài lẫn ruột đã bọc. Khóa công khai **suy ra từ** khóa riêng, không khai riêng — không có đường sinh ra một cặp lệch. | Chữ ký là lời bảo chứng *"vé này do máy chủ phát sau khi đã kiểm phiên và kiểm chủ nick"*. Cầu nối xác minh chữ ký **trước khi** giải mã bất cứ thứ gì. | `TICKET_SIGNING_KEY`; `keys:server-keygen`, `keys:server-pubkey` |
| **Chống dùng lại vé (replay guard)** | Sổ vé đã tiêu, nằm ở **cầu nối** chứ không phải máy chủ. | Cầu nối không nối mạng để hỏi ai, và máy chủ cũng không biết — nó phát vé rồi thôi. Cầu nối khởi động lại thì sổ mất, nhưng mọi vé phát trước đó cũng đã hết hạn. | `ticket-replay-guard.ts` |
| **Số phiên bản trên vé** | Mỗi vé mang hai số phiên bản, `verifyTicket` kiểm ngay sau chữ ký. | Cầu nối bản cũ phải nói được *"bản quá cũ, tải lại"* thay vì chết mơ hồ ở bước giải mã. | `MIN_RELAY_VERSION_BY_KIND` |
| **Sổ đăng ký máy** | Danh sách máy chạy cầu nối, mỗi máy khai một khóa công khai X25519. Cả team đọc được. Mỗi người tự ghi máy mình đang ngồi ở `/setup`; ADMIN ghi hộ máy không ngồi được, phát khóa vùng operator, và thu hồi. | Máy chưa vào sổ **không xin được vé nào**. Khóa công khai lộ cũng không mất gì, còn giấu đi thì không ai tự trả lời được *"máy tôi vào sổ chưa?"*. | `schema.prisma` → `RelayDevice`; trang `/relay-devices` |
| **Thu hồi máy** | Đánh dấu một máy là mất/không tin nữa. Một chiều. | **Chặn vé mới, KHÔNG với tới ciphertext chiếc máy đó đã lấy về từ trước** — thứ đang nằm trên ổ cứng chiếc laptop đã mất. Mất máy thật thì thu hồi xong vẫn phải xoay `VAULT_KEY_OPERATOR`. Ranh giới này có test canh. | `RelayDevice.revokedAt` |
| **Cấp khóa operator** | ADMIN bấm một nút, cầu nối trên máy ADMIN bọc `VAULT_KEY_OPERATOR` cho đúng máy nhận; máy chủ giữ hộ tới khi máy đó mở web app. | Không có mã nào để gửi cho nhau. Sổ ghi *"chưa cấp"* chứ không ghi *"chưa có khóa"* — máy dán khóa bằng tay thì máy chủ mù cho tới khi chính nó khai. | `RelayDevice.operatorKeyGrant`, `operatorKeyReadyAt` |
| **Ghim nick vào máy** | Mỗi nick thuộc về đúng một máy trong sổ Relay. `Account.deviceId` quyết định vé bay về đâu — **không phải người đang bấm nút**. | Profile data hiện tồn tại cục bộ trên máy đó, nên thao tác phải quay lại đúng máy được gán. Đây là boundary lưu trữ/routing, không phải bằng chứng identity isolation. Nút tạo profile tự ghim luôn nick vào máy vừa tạo. ADMIN cũng không có ngoại lệ ở nút mở profile. | `Account.deviceId`; `ticket-recipient-lookup.ts` |
| **ADMIN / OPERATOR** | Hai vai trò. ADMIN: phân công cụm, đăng ký/thu hồi máy, cấp khóa, **giữ kho proxy**. OPERATOR: mọi thứ còn lại, trừ bí mật của nick không phải mình phụ trách. | **Tầm nhìn không chia** — ai cũng thấy nick và job của người khác, vì luật đụng độ thread phải nêu đúng tên nick đồng nghiệp thì người đọc mới xử lý được. Thứ bị chia là **quyền ghi** và **bí mật nick**, và chặn nằm ở tầng phát vé chứ không phải ẩn nút. | `ALLOWED_EMAILS`, `ADMIN_EMAILS`; `src/lib/auth/require-actor.ts` |
| **Readiness** | The verdict for whether the account's **technical setup** is complete for a controlled local action. Browser-backed Reddit and TikTok accounts require the proxy/profile/device/manual-login boundary; API-only Facebook accounts use the lighter Page path. | Separates a legitimate wait from missing configuration and prevents new browser platforms from defaulting to the weaker Facebook branch; it is not production approval or identity-isolation evidence. | `src/lib/accounts/account-readiness.ts` → `ReadinessBlockerCode` |
| **Đăng nhập lần đầu** | Chặng 3 của luồng nhập nick: mở profile vừa dựng, đăng nhập nick vào đó, rồi bấm *"Đã đăng nhập được"* — thao tác do người vận hành thực hiện. | Nút tạo profile sinh ra một **trình duyệt trắng** — có proxy và các cài đặt profile, chưa một cookie nào. Một nick khoe màu xanh mà chưa ai đăng nhập là lời nói dối chỉ lộ ra vào hôm định đăng bài; bước này không tự động hóa và không chứng minh identity isolation. | `Account.firstLoginAt`; blocker `NOT_LOGGED_IN` |

---

## 10 luật an toàn — vì sao mỗi luật tồn tại

Bộ luật chạy tuần tự, **không dừng ở luật chặn đầu tiên** — người dùng cần thấy hết mọi vấn đề
trong một lần. Ngưỡng mặc định lấy từ [`rule-thresholds.ts`](../src/lib/rules/rule-thresholds.ts).

Cột **Áp cho**: `mọi` = mọi nền tảng, `cộng đồng` = Reddit + Facebook Group (xem
[Nền tảng cộng đồng](#nền-tảng-cộng-đồng) bên dưới).

Số luật **thực chạy** khác nhau theo nền tảng: Reddit **10**, Facebook Group **9**, Fanpage **5**.

| # | Tên luật | BLOCK khi | WARN khi | Ghi đè? | Áp cho | Lý do nghiệp vụ |
|---|---|---|---|---|---|---|
| 1 | Sức khỏe nick | Trạng thái ≠ `ALIVE` | — | ✅ | mọi | Nick dính checkpoint hoặc shadowban mà đăng tiếp là biến cảnh báo mềm thành khóa vĩnh viễn |
| 2 | Cold start | `scheduledAt` còn nằm trong cold-start | Vừa hết cold-start chưa quá 2 ngày | ✅ | mọi | Nick mới hoạt động mạnh ngay bị nền tảng soi kỹ. 14 ngày chỉ đọc là tối thiểu |
| 3 | Điều kiện đích | Thiếu karma hoặc tuổi nick chưa đủ theo luật sub | Karma chỉ dư < 20% so với mức tối thiểu | ✅ | mọi | Bài bị AutoModerator gỡ im lặng. Lặp lại thì mod người thật soi cả cụm nick |
| 4 | Hạn mức ngày | Nick đã có ≥ 2 bài trong ngày | Bài thứ 2 trong ngày | ✅ | **cộng đồng** | Nhịp đăng đều và dày là dấu hiệu dễ nhận nhất của tài khoản vận hành bằng tool |
| 5 | Nghỉ giữa 2 bài | Hai bài cùng đích cách < 24 tiếng | Cách < 48 tiếng | ✅ | **cộng đồng** | Nhiều sub cấm cứng 1 bài/24h/người. Kể cả không cấm, mod vẫn để ý nick xuất hiện liên tục |
| 6 | Tỷ lệ promo | Chưa đủ ratio bài hữu ích cho bài quảng cáo tiếp | Vừa khít hạn mức (đăng xong là hết quota) | ✅ | **cộng đồng** | Một trong hai luật không cộng đồng nào tha thứ. Vi phạm thì mod soi cả cụm |
| 7 | Trùng nội dung | Jaccard ≥ 0.70 với bài cùng nền tảng trong 30 ngày | Jaccard ≥ 0.50 | ✅ | mọi | Nguyên nhân shadowban số 1. Reddit gọi thẳng tên: "coordinated inauthentic behavior" |
| 8 | Đụng độ thread | Nick khác đã chạm đúng thread này | Nick khác hoạt động cùng đích trong 1 tiếng | **❌** | **cộng đồng** | Tín hiệu phối hợp rõ nhất. Không có lý do kinh doanh nào đủ lớn để đánh đổi |
| 9 | Chính sách link | Đích cấm link mà bài có link | Bài có ≥ 2 link | ✅ | mọi | Bài bị gỡ im lặng vì link là tệ nhất: mình tưởng đã đăng, thật ra không ai thấy |
| 10 | Kết quả dò gần nhất | Lần dò cuối kết luận `SHADOWBANNED` hoặc `CHECKPOINT` | Chưa dò lần nào; dò quá 3 ngày; dò lỗi (`ERROR`); không có bài nào để đối chiếu (`NO_BASELINE`); thấy ít bài hơn đã đăng (`WARN`) | ✅ | **Reddit** | Luật 1 đọc thứ **mình tự đặt**, luật này đọc thứ **người ngoài nhìn thấy**. Gỡ cách ly bằng tay mà chưa dò lại thì luật 1 cho qua, luật này vẫn chặn. *Không có tin xấu* không phải *tin tốt* |

### Nền tảng cộng đồng

`COMMUNITY_PLATFORMS = ["REDDIT", "FACEBOOK_GROUP"]` — nơi mình là **khách trong nhà người
khác**: có mod, có luật riêng của sub/group, có hàng xóm để ý nhịp đăng.

`FACEBOOK_PAGE` nằm ngoài vì Fanpage là **kênh của chính mình**. Đăng 5 bài một ngày, đăng đều
đặn hằng ngày, hay đăng toàn nội dung bán hàng đều là chuyện bình thường của một trang thương
hiệu — bốn luật giữ nhịp (4, 5, 6, 8) áp vào đó chỉ chặn nhầm nội dung hợp lệ. Đặc biệt luật 8:
trang trả lời bình luận dưới bài của chính mình là chăm sóc khách hàng, không phải hai nick giả
vờ đồng tình với nhau.

Facebook Group thì **vẫn chạy 9 trong 10 luật** — group vận hành như sub Reddit, không phải như
Page. Luật duy nhất không áp là luật 10 (dò shadowban), vì bộ dò chỉ đọc được profile Reddit.

Luật bị bỏ qua được liệt kê trong `RuleEvaluation.skipped` và hiện thẳng trên checklist
("Không áp dụng cho nền tảng này: …"). Lỗ hổng im lặng trong hệ thống an toàn nguy hiểm hơn
không có luật.

→ `platform-family.ts` → `COMMUNITY_PLATFORMS`, `isCommunityPlatform()`;
`rules-engine.ts` → `RuleDefinition.platforms`.

### 4 điểm phản trực giác

1. **Luật 8 là luật duy nhất không cho ghi đè.** Hai nick cùng chủ chạm một thread là tín hiệu
   phối hợp rõ nhất nền tảng bắt được. Trên Reddit, cùng IP thì shadowban tức thì; khác IP vẫn
   bị chấm điểm nghi ngờ. Không có lý do kinh doanh nào đủ lớn để đánh đổi.
   → `rules-engine.ts` dòng 57-58: `overridable: false`.

2. **Tỷ lệ promo là tỷ lệ trượt.** Bài quảng cáo thứ N đòi N × ratio bài hữu ích, không phải
   "đủ 9 bài một lần rồi thôi". Cách đếm một lần cho phép spam vô hạn sau 9 bài đầu.
   → `rule-promo-ratio.ts` dòng 20: `required = (promoCount + 1) * ratio`.

3. **So trùng chỉ trong cùng họ nền tảng.** Các nền tảng không chia sẻ dữ liệu, nên đăng cùng
   một bài lên Reddit và Facebook là bình thường. Nhưng Fanpage và Group đều là Facebook.
   → `rule-context-queries.ts` dòng 104: lọc theo `platformFamily()`.

4. **Mốc thời gian của luật là `scheduledAt`, không phải "bây giờ".** Xếp bài vào sau ngày hết
   cold-start thì phải được cho qua.
   → `rule-types.ts` dòng 77-79: `at: Date` = giờ dự kiến đăng.

---

## Dò shadowban — 6 kết luận (Phase 03)

`npm run health` mở profile công khai của nick ở chế độ **chưa đăng nhập**, qua **proxy quan sát
viên riêng**, rồi đối chiếu số bài thấy được với số bài đã đánh dấu `POSTED`.

| Kết luận | Đo được gì | Hệ quả |
|---|---|---|
| `HEALTHY` | Profile bình thường, thấy đủ bài | Luật 10 cho qua. **Không** tự gỡ cách ly |
| `SHADOWBANNED` | HTTP 404, hoặc 0/N bài đã đăng nhìn thấy được | Nick tự chuyển trạng thái, luật 10 **chặn** |
| `CHECKPOINT` | Trang báo tài khoản bị treo | Nick tự chuyển trạng thái, luật 10 **chặn** |
| `WARN` | Thấy dưới một nửa số bài đã đăng | Có thể chỉ là mod xóa bài — luật 10 cảnh báo |
| `ERROR` | Bộ dò dính captcha, hoặc Reddit đổi HTML | **Không phải tin tốt** — luật 10 cảnh báo |
| `NO_BASELINE` | Bộ dò chạy ngon nhưng không bài nào được đánh dấu đã đăng | **Không phải tin tốt** — luật 10 cảnh báo |

Hai kết luận cuối đều nghĩa là "chưa biết", khác nhau ở nguyên nhân: `ERROR` là **bộ dò hỏng**,
`NO_BASELINE` là **bộ dò chạy nhưng không có gì để so**. Nick mới hoặc đang nghỉ rơi vào
`NO_BASELINE` là bình thường; nick đăng đều mà không ai bấm "Đã đăng" cũng rơi vào đúng ô này —
và đó mới là lúc cần cảnh báo nhất.

**Chiều gỡ cách ly không tự động.** Nick bị kết luận `SHADOWBANNED`/`CHECKPOINT` tự đổi trạng
thái; nhưng một lần dò khỏe **không** tự gỡ, vì nó chỉ chứng minh lần dò đó không thấy vấn đề.
Gỡ là quyết định của người.

→ `health-verdict.ts`, `health-status-evaluator.ts`, `reddit-shadowban-prober.ts`,
`rule-health-check.ts`

---

## Câu hỏi chưa có lời giải

- Ngưỡng Jaccard 0.70 lấy theo kinh nghiệm chung, chưa có số liệu thật từ chính đàn nick này.
  Phase 03 đã xong nên có chỗ để đo, và proxy quan sát viên đã có trên máy chủ thật từ 06/08/2026
  — nhưng chưa có nick thật để dò, nên vẫn chưa có số liệu để quyết siết hay nới.
- Chưa rõ cần thêm luật "cùng IP range" hay không — hiện proxy tĩnh đã ép 1:1, nhưng chưa kiểm
  tra hai proxy có nằm cùng /24 không.
