# Từ điển thuật ngữ nghiệp vụ

**Cập nhật:** 02/08/2026

Bộ luật an toàn là tri thức nghiệp vụ được mã hóa thành code. Tài liệu này giải thích
từng khái niệm để 6 tháng nữa vẫn hiểu vì sao ngưỡng Jaccard là 0.70 chứ không phải 0.85.

Mỗi mục: **thuật ngữ → định nghĩa → vì sao quan trọng → nơi xuất hiện trong code.**

Tra cứu thêm: [tài liệu sản phẩm](project-overview-pdr.md) · [bản đồ mã nguồn](codebase-summary.md) · [README](../README.md)

---

## Danh tính

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Nick / tài khoản** | Một tài khoản trên Reddit hoặc Facebook. Đơn vị gắn 1:1 với proxy và vân tay. | Toàn bộ bộ luật xoay quanh việc giữ mỗi nick "sạch". | `prisma/schema.prisma` → model `Account` |
| **Nhân vật (persona)** | Giọng điệu + mảng nội dung gắn với nick. Một nhân vật có thể có nick ở nhiều nền tảng. | Giữ mỗi nick nói một giọng riêng — nhiều nick viết giống nhau là tự khai cùng một người. **Lưu ý:** bộ luật hiện KHÔNG dùng persona; luật 7 so trùng theo họ nền tảng và xét mọi nick. | `schema.prisma` → `Persona`; `src/app/personas/` |
| **Vân tay (fingerprint)** | Tổ hợp đặc điểm trình duyệt (canvas, WebGL, font, timezone…) dùng để nhận diện thiết bị. | Hai nick chung vân tay = cùng một người = shadowban. | Do antidetect browser quản lý, MKTTool chỉ lưu `antidetectProfileId` |
| **Antidetect browser** | Ứng dụng tạo nhiều profile trình duyệt, mỗi profile một vân tay khác nhau. Hiện dùng MultiZen. | Là lớp cách ly phần cứng giữa các nick. | `src/lib/antidetect/` |
| **Profile** | Một instance trình duyệt bên antidetect browser, gắn 1:1 với nick qua `antidetectProfileId @unique`. | Ép bằng ràng buộc DB — hai nick chung profile là không thể. | `schema.prisma` → `Account.antidetectProfileId` |
| **Cụm nick** | Tập hợp mọi nick do cùng một người vận hành (tức toàn bộ nick trong database). | Bộ luật coi mọi nick trong DB là "của mình" khi kiểm tra đụng độ. | Ngầm định trong `rule-context-queries.ts` |
| **Email gốc** | Email đi kèm lúc mua nick, dùng để khôi phục mật khẩu. Mã hóa trước khi lưu. | Mất email = mất quyền khôi phục nick. | `Account.emailAddress`, `Account.emailPasswordEnc` |
| **TOTP secret** | Khóa bí mật sinh mã OTP cho 2FA. Mã hóa AES-256-GCM trước khi lưu. | Thiếu TOTP thì không đăng nhập được khi bật 2FA. | `Account.totpSecretEnc`; `src/lib/totp/` |

## Mạng

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Proxy tĩnh (static ISP)** | Còn gọi **static residential ISP**. IP dân dụng **cố định**, thuê theo IP chứ không theo dung lượng. **Loại duy nhất dùng cho nick thật** — Phase 00 khuyến nghị IPRoyal Static Residential ISP. | IP không đổi → nền tảng thấy nick luôn vào từ một IP dân dụng, giống hệt người thật ngồi nhà. | `schema.prisma` → `Proxy` (type `STATIC_ISP`) |
| **Proxy xoay (rotating residential)** | IP dân dụng nhưng **đổi liên tục**, tính tiền theo GB. | **Đây mới là loại bị loại bỏ**, không phải "residential" nói chung. IP đổi liên tục phá ràng buộc 1 nick : 1 IP, và bản cũ tính ra ~5,4 triệu/tháng tiền băng thông. | `docs/archive/` |
| **Proxy datacenter** | IP thuộc trung tâm dữ liệu, rẻ, dễ bị nhận diện là máy chủ. | Chỉ dùng test kỹ thuật (xem profile có ăn đúng IP không). Đưa nick thật vào = giết nick. | Cảnh báo trong `README.md` và `project-overview-pdr.md` |
| **Proxy mobile** | IP từ mạng di động. | Tùy chọn thay thế cho static ISP. | `Proxy.type` cho phép giá trị `MOBILE` |
| **Proxy quan sát viên (observer proxy)** | Proxy riêng, TUYỆT ĐỐI không đăng nhập nick nào. Dùng để dò shadowban từ góc nhìn người ngoài. | Phải dùng IP khác, nếu không nền tảng thấy cùng IP vừa đăng vừa kiểm tra. | `schema.prisma` → `ObserverProxy` |
| **Dải /24** | 256 IP liền kề chia sẻ 24 bit đầu. | Hai nick dùng IP cùng /24 vẫn có thể bị gắn cờ — nên mua proxy từ nhiều /24 khác nhau. | Kinh nghiệm vận hành, chưa có code ép |
| **ASN** | Autonomous System Number — định danh nhà cung cấp mạng. | Nền tảng check ASN để phân biệt IP dân dụng vs datacenter. | Chưa kiểm tra tự động |
| **SOCKS5 bridge** | Đường hầm SOCKS5 để DNS phân giải từ xa (qua proxy, không qua máy cục bộ). | Nếu DNS phân giải tại chỗ, nền tảng thấy DNS không khớp IP → nghi ngờ. | MultiZen `create_profile`/`update_profile` hỗ trợ sẵn |

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
| **Họ nền tảng (platform family)** | Gom các loại đích về một nhóm: `REDDIT` / `FACEBOOK` (gồm `FACEBOOK_PAGE` + `FACEBOOK_GROUP`). | So trùng chỉ trong cùng họ — các nền tảng không chia sẻ dữ liệu, đăng cùng bài lên Reddit và Facebook là bình thường; nhưng Fanpage và Group đều là Facebook. | `src/lib/platforms/platform-family.ts` |

## Bộ luật

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **Tỷ lệ 9:1** | Cứ 1 bài quảng cáo đòi 9 bài hữu ích tại cùng đích. Mặc định `promoRatio = 9` trên `PlatformTarget`. | Hầu hết sub ngách áp tỷ lệ này. Vi phạm thì mod soi cả cụm nick. | `rule-promo-ratio.ts`; `PlatformTarget.promoRatio` |
| **Tỷ lệ trượt** | Cách đếm promo: bài quảng cáo thứ N đòi N × ratio bài hữu ích. Không phải "đủ 9 bài một lần rồi thôi". | Đếm kiểu một lần cho phép spam vô hạn sau 9 bài đầu. | `rule-promo-ratio.ts` → `required = (promoCount + 1) * ratio` |
| **Đụng độ thread** | Hai nick cùng chủ chạm vào một thread (bài viết). | Tín hiệu phối hợp rõ nhất mà nền tảng bắt được. Luật 8, **không cho ghi đè**. | `rule-thread-collision.ts` |
| **Trigram Jaccard** | So độ giống hai bài bằng Jaccard trên tập trigram ký tự (chuỗi 3 ký tự liền). | Chạy micro giây, không cần mạng, bắt được bài copy-paste sửa vài chữ. Bài viết lại hoàn toàn cùng ý thì lọt — chấp nhận. | `content-similarity-calculator.ts` |
| **Chuẩn hóa văn bản** | Bỏ dấu tiếng Việt (NFD + xóa combining marks), hạ thường, `đ→d`, bỏ ký tự đặc biệt. | Hai bài chỉ khác dấu câu hay viết hoa phải cho ra cùng chuỗi khi so trùng. | `text-normalizer.ts` → `normalizeText()` |
| **Verdict ALLOW/WARN/BLOCK** | Kết quả mỗi luật. **ALLOW/WARN**: lưu job bình thường, không cần làm gì thêm — WARN chỉ là lời nhắc. **BLOCK**: nút lưu khóa lại, muốn qua phải nhập lý do ghi đè (trừ luật 8, không có đường vòng). | UI hiện checklist đầy đủ cả 9 luật để người dùng thấy hết vấn đề trong một lần, không phải sửa xong lại lòi ra lỗi tiếp. | `rule-types.ts` → `RuleVerdict`; `post-job-actions.ts` |
| **Ngưỡng (`RuleConfig`)** | Bảng key-value trong DB, ghi đè ngưỡng mặc định mà không cần sửa code. | Siết/nới nhanh khi có dữ liệu thật, không cần build lại. | `schema.prisma` → `RuleConfig`; `rule-thresholds.ts` |

## Kỹ thuật

| Thuật ngữ | Định nghĩa | Vì sao quan trọng | Nơi xuất hiện |
|---|---|---|---|
| **MCP** | Model Context Protocol — giao thức JSON-RPC 2.0 để gọi tool trên server. MultiZen phơi 22 tool qua MCP. | Phase 05 dùng tool MCP để lái trình duyệt thay vì Playwright (vì MultiZen không phơi CDP). | `src/lib/antidetect/multizen-mcp-client.ts` |
| **CDP** | Chrome DevTools Protocol — giao thức điều khiển Chromium ở tầng thấp. | MultiZen **không phơi** CDP ra ngoài. AdsPower thì có. | `antidetect-browser-adapter.ts` → `cdpEndpoint?` (optional) |
| **Human handoff** | Khi bot gặp 2FA/captcha, dừng lại để người bước vào xử lý tay. | MultiZen hỗ trợ sẵn (profile mở, người thao tác trực tiếp). Không tự giải captcha. | Tính năng của MultiZen, tham chiếu ở `project-overview-pdr.md` |
| **Behavioral injection** | MultiZen mô phỏng hành vi người ở tầng CDP (di chuột, cuộn trang, delay ngẫu nhiên). | Giảm khả năng bị nhận diện là bot. | Tính năng nội tại của MultiZen |

---

## 9 luật an toàn — vì sao mỗi luật tồn tại

Bộ luật chạy tuần tự, **không dừng ở luật chặn đầu tiên** — người dùng cần thấy hết mọi vấn đề
trong một lần. Ngưỡng mặc định lấy từ [`rule-thresholds.ts`](../src/lib/rules/rule-thresholds.ts).

| # | Tên luật | BLOCK khi | WARN khi | Ghi đè? | Lý do nghiệp vụ |
|---|---|---|---|---|---|
| 1 | Sức khỏe nick | Trạng thái ≠ `ALIVE` | — | ✅ | Nick dính checkpoint hoặc shadowban mà đăng tiếp là biến cảnh báo mềm thành khóa vĩnh viễn |
| 2 | Cold start | `scheduledAt` còn nằm trong cold-start | Vừa hết cold-start chưa quá 2 ngày | ✅ | Nick mới hoạt động mạnh ngay bị nền tảng soi kỹ. 14 ngày chỉ đọc là tối thiểu |
| 3 | Điều kiện đích | Thiếu karma hoặc tuổi nick chưa đủ theo luật sub | Karma chỉ dư < 20% so với mức tối thiểu | ✅ | Bài bị AutoModerator gỡ im lặng. Lặp lại thì mod người thật soi cả cụm nick |
| 4 | Hạn mức ngày | Nick đã có ≥ 2 bài trong ngày | Bài thứ 2 trong ngày | ✅ | Nhịp đăng đều và dày là dấu hiệu dễ nhận nhất của tài khoản vận hành bằng tool |
| 5 | Nghỉ giữa 2 bài | Hai bài cùng đích cách < 24 tiếng | Cách < 48 tiếng | ✅ | Nhiều sub cấm cứng 1 bài/24h/người. Kể cả không cấm, mod vẫn để ý nick xuất hiện liên tục |
| 6 | Tỷ lệ promo | Chưa đủ ratio bài hữu ích cho bài quảng cáo tiếp | Vừa khít hạn mức (đăng xong là hết quota) | ✅ | Một trong hai luật không nền tảng nào tha thứ. Vi phạm thì mod soi cả cụm |
| 7 | Trùng nội dung | Jaccard ≥ 0.70 với bài cùng nền tảng trong 30 ngày | Jaccard ≥ 0.50 | ✅ | Nguyên nhân shadowban số 1. Reddit gọi thẳng tên: "coordinated inauthentic behavior" |
| 8 | Đụng độ thread | Nick khác đã chạm đúng thread này | Nick khác hoạt động cùng đích trong 1 tiếng | **❌** | Tín hiệu phối hợp rõ nhất. Không có lý do kinh doanh nào đủ lớn để đánh đổi |
| 9 | Chính sách link | Đích cấm link mà bài có link | Bài có ≥ 2 link | ✅ | Bài bị gỡ im lặng vì link là tệ nhất: mình tưởng đã đăng, thật ra không ai thấy |

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

## Câu hỏi chưa có lời giải

- Ngưỡng Jaccard 0.70 lấy theo kinh nghiệm chung, chưa có số liệu thật từ chính đàn nick này.
  Phải chờ Phase 03 mới biết nên siết hay nới.
- Chưa rõ cần thêm luật "cùng IP range" hay không — hiện proxy tĩnh đã ép 1:1, nhưng chưa kiểm
  tra hai proxy có nằm cùng /24 không.
