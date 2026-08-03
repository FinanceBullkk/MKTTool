# Phase 00 — Chuẩn bị & Kiểm chứng khả thi

**Không viết dòng code sản phẩm nào ở giai đoạn này.**

## Context Links
- [plan.md](plan.md)
- [Báo cáo review rủi ro](../reports/review-260801-1951-gemini-risk-assessment-critique.md)

## Overview
- **Priority:** P0 — chặn đường mọi giai đoạn sau
- **Status:** 🟡 Đang chạy — phần kiểm chứng kỹ thuật xong 02/08/2026 (Chặng B + C đạt).
  Còn mua proxy/nick + 14 ngày cold-start
- **Thời lượng:** 2 tuần (chủ yếu là chờ, không phải làm)
- **Mục đích:** Trả lời 2 câu hỏi có thể giết dự án, TRƯỚC khi đầu tư công sức code.

## Key Insights

1. **Thứ tự bắt buộc: proxy TRƯỚC, nick SAU.** Nick cổ đăng nhập lần đầu từ IP sai quốc gia →
   điểm tin cậy phiên rớt về gần 0 → checkpoint ngay. Không có proxy đúng nước thì đừng mua nick.
2. **Không có email gốc thì không mua.** Người bán giữ email gốc = lấy lại nick bất cứ lúc nào
   bằng chức năng "quên mật khẩu", kể cả sau khi bạn đã nuôi nick 3 tháng.
3. **Nick mua về không dùng được ngay.** Cần 7-14 ngày chỉ đọc, không đăng, không đổi thông tin.
4. **Reddit shadowban dễ kiểm tra:** mở `reddit.com/user/<tên>` ở chế độ ẩn danh. Trống/404 = bị ẩn.
5. ~~Câu hỏi kỹ thuật chặn đường: **Playwright có `connectOverCDP` được vào MultiZen không?**~~
   **ĐÃ GIẢI — 02/08/2026, không cần Playwright nữa.** Xem mục dưới.

## ✅ Kết luận câu hỏi chặn đường (02/08/2026)

### Đã kiểm chứng bằng thực nghiệm — Chặng B ĐẠT (02/08/2026, 03:01)

MultiZen v0.3.1 cài trên máy thật, MKTTool bấm "Mở profile" → **cửa sổ Chromium của profile mở ra**.

| Bằng chứng | |
|---|---|
| `AuditLog` | `PROFILE_LAUNCHED \| MultiZen / proxy smoke-proxy-b…` |
| MultiZen (`list_profiles`) | `isRunning: true` |
| Vân tay có được áp dụng không | Có — trang mặc định hiện tiếng Thụy Điển, khớp `timezone: Europe/Stockholm` của profile |
| Bắt tay MCP | OK, server trả `{"name":"multizen","version":"0.2.0-pre"}`, 22 tool |

Hai điều chỉ lộ ra khi chạy thật, đã sửa trong code:

1. **MCP server đòi bearer token** — client cũ không gửi header `Authorization`, mọi lời gọi ăn 401.
   Token lấy ở app (`MCP → Connect an agent`), để trong `MULTIZEN_MCP_TOKEN`.
2. **README chỉ liệt kê 8 tool, thực tế có 22** — trong đó có `create_profile`/`update_profile`
   **nhận được cả object proxy**. Nghĩa là MKTTool đẩy proxy sang MultiZen được, không phải nhập tay hai nơi.

### Đối chiếu tài liệu nguồn

Đối chiếu README của [multizenteam/multizen-browser](https://github.com/multizenteam/multizen-browser)
(MIT, commit gần nhất 26/07/2026):

| Câu hỏi | Trả lời |
|---|---|
| Playwright `connectOverCDP` vào MultiZen được không? | **Gần như chắc là không** — MultiZen dùng `chrome-remote-interface` nội bộ, không công bố endpoint CDP ra ngoài |
| Vậy có phải chuyển AdsPower không? | **Không.** MultiZen phơi thẳng tool điều khiển qua MCP: `navigate`, `click`, `type`, `extract`, `screenshot` |
| Phase 05 đi đường nào? | Gọi tool MCP của MultiZen, **bỏ Playwright** |

Hóa ra đường này còn tốt hơn Playwright, vì được thêm hai thứ:

- **Human handoff** — gặp 2FA/CAPTCHA thì người vào tay ngay trong cửa sổ đó, xong máy chạy tiếp.
  Đúng nguyên tắc "gặp captcha là không tự giải" của Phase 01.
- **Behavioral injection** — quỹ đạo chuột, nhịp gõ phím, rung cuộn được làm giống người ở tầng CDP input.

Hai điều **bắt buộc phải biết** trước khi test:

1. **MCP server đòi bearer token.** Lấy trong app: `MCP → Connect an agent` (hoặc file `mcp-token`
   ở thư mục dữ liệu app), dán vào `MULTIZEN_MCP_TOKEN` trong `.env`. Thiếu là mọi lời gọi ăn HTTP 401.
2. **Proxy hiện phải cấu hình TRONG MultiZen, theo từng profile.** MKTTool chưa đẩy proxy sang
   trình duyệt — nó mới chỉ lưu "proxy nào thuộc nick nào" và ép ràng buộc 1:1. Nhập proxy vào
   MKTTool mà quên nhập trong MultiZen thì trình duyệt vẫn chạy bằng IP nhà bạn.
   **Đã tự động hóa 02/08/2026:** `update_profile` nhận object proxy đầy đủ
   (`type`/`host`/`port`/`username`/`password`, kèm SOCKS5 bridge để DNS phân giải từ xa).
   MKTTool đồng bộ proxy trước mỗi lần mở profile.

Điểm cộng: MultiZen **tự căn múi giờ theo IP proxy** — thứ hay bị quên và là dấu hiệu lộ rất
nặng (nick "ở Mỹ" mà máy báo múi giờ +7).

> ⚠️ **Nhưng KHÔNG căn ngôn ngữ.** Đo trong Chặng C 02/08/2026: proxy GB → `timezone` thành
> `Europe/London` (dù cấu hình ghi `Europe/Stockholm`), còn `navigator.language` vẫn là `sv-SE`
> của vân tay gốc.
>
> **Bổ sung vào Bước 4 (cold start), làm TRƯỚC lần đăng nhập đầu tiên:** với mỗi profile, gắn
> proxy xong thì vào tab Fingerprint bấm **"Match proxy"** để căn ngôn ngữ. Bấm sau khi nick đã
> nuôi thì đừng — đổi ngôn ngữ giữa chừng còn đáng ngờ hơn là để lệch.

## Requirements

### Functional
- Chốt danh sách 2-3 subreddit mục tiêu + luật của từng sub
- Có 11 proxy tĩnh hoạt động (8 Reddit + 3 FB)
- Có 8 nick Reddit + 3 nick FB, đã đổi hết thông tin khôi phục
- Trả lời được: MultiZen có điều khiển bằng Playwright được không

### Non-functional
- Tỷ lệ nick sống sau 2 tuần cold-start ≥ 70% (nếu < 50% → đổi nguồn bán nick)

## Architecture
Chưa có. Giai đoạn này chỉ có bảng tính + trình duyệt.

## Implementation Steps

### Bước 1 — Chốt mục tiêu (1-2 ngày)
1. Team MKT liệt kê 2-3 subreddit ngách liên quan sản phẩm.
2. Với mỗi sub, ghi lại vào bảng tính: karma tối thiểu, tuổi nick tối thiểu, luật tự quảng cáo
   (thường 9:1), có cấm link không, mod hoạt động mạnh không.
3. Đọc 100 bài top của mỗi sub → xác định "giọng" cộng đồng chấp nhận.
4. **Quyết định:** nếu sub nào cấm hoàn toàn tự quảng cáo → loại, tìm sub khác.

### Bước 2 — Mua proxy (1 ngày)
1. Mua **static residential / ISP proxy**, KHÔNG mua loại tính theo GB, KHÔNG mua loại xoay IP.
   Nhà cung cấp tham khảo: IPRoyal (Static Residential ISP).
2. Số lượng: 11 IP (1 IP : 1 nick, không dùng chung).
3. Quốc gia: khớp với quốc gia của nick sẽ mua (hỏi người bán nick trước).
4. **Mua thử 2 IP trước**, kiểm xong mới mua 9 cái còn lại:
   - `ipinfo.io` → ASN phải là ISP dân dụng thật (Comcast, AT&T, Verizon…), không phải hosting
   - `scamalytics.com` hoặc `ipqualityscore.com` → điểm gian lận phải thấp. ASN đẹp mà IP từng bị
     lạm dụng thì vẫn chết
   - Mở `reddit.com` ở chế độ ẩn danh qua IP đó → không dính captcha/chặn
5. Đòi nhà cung cấp cấp IP thuộc **các dải /24 khác nhau** — 11 IP liền kề nhau là tự khai báo
   cả cụm nick là của một người.

### Bước 3 — Mua nick (2-3 ngày)
1. **Reddit:** 8 nick, ưu tiên tuổi ≥ 1 năm, karma ≥ 500, có lịch sử comment thật.
2. **Facebook:** 3 nick cá nhân, tuổi ≥ 2 năm, có bạn bè thật, đã từng đăng bài.
3. Checklist bắt buộc khi nhận nick — thiếu bất kỳ mục nào thì hoàn tiền:
   - [ ] Nhận được email gốc + mật khẩu email
   - [ ] Người bán cho biết quốc gia/thiết bị nick từng dùng
   - [ ] Nick chưa từng bị suspend (kiểm tra lịch sử)
4. Ngay sau khi nhận, làm theo đúng thứ tự: đổi mật khẩu email → đổi email khôi phục →
   đổi SĐT khôi phục → đổi mật khẩu nick → bật 2FA của mình, lưu TOTP secret →
   đăng xuất toàn bộ thiết bị lạ.

### Bước 4 — Cold start 14 ngày
Với mỗi nick, tạo profile trong MultiZen: gắn đúng proxy, đặt vân tay khớp hệ điều hành nick từng dùng.

| Ngày | Được làm | Cấm |
|---|---|---|
| 1-3 | Đăng nhập, đọc, cuộn 5-10 phút/ngày | Mọi thứ khác |
| 4-7 | Thêm upvote 2-3 bài/ngày | Đăng bài, comment, đổi profile |
| 8-11 | Thêm comment 1-2 cái/ngày (nội dung thật, hữu ích) | Đăng bài, nhắc sản phẩm |
| 12-14 | Comment 2-3 cái/ngày, join sub mục tiêu | Nhắc sản phẩm |

Ghi log thủ công vào bảng tính: ngày, nick, việc đã làm, có gặp captcha/checkpoint không.

### Bước 5 — Test MultiZen (1 ngày, làm song song, **0đ**)

Làm được ngay bây giờ, không cần mua gì, không cần nick nào.

**Chặng B — mở profile rỗng, không proxy**

1. Cài MultiZen. Mở app → `MCP → Connect an agent` → copy bearer token.
2. Điền `.env`: `ANTIDETECT_PROVIDER="multizen"`, `MULTIZEN_MCP_URL="http://127.0.0.1:7777"`,
   `MULTIZEN_MCP_TOKEN="<token vừa copy>"`.
3. Trong MultiZen: tạo 1 profile rỗng, **không gán proxy**. Copy id profile.
4. `npm run dev` → `localhost:3000`. Nhập theo thứ tự: Nhân vật giả → Proxy giả → **Tài khoản giả
   hoàn toàn** (`test-01` / mật khẩu bất kỳ / `test@example.com`), dán id profile vào ô
   "Id profile antidetect".
5. Bấm **"Mở profile"**:

| Kết quả | Nghĩa là | Làm gì tiếp |
|---|---|---|
| Profile mở ra | ✅ Đạt — chuyển Chặng C | |
| *"…từ chối token (HTTP 401/403)"* | Token sai hoặc chưa dán | Copy lại token từ app |
| *"Không kết nối được tới MultiZen"* | App chưa chạy, hoặc MCP server chưa bật | Kiểm tra app đang mở |
| *"không có tool mở profile nào"* | Bản MultiZen đổi tên tool | Thông báo hiện luôn danh sách tool thật — thêm vào `LAUNCH_TOOL_NAMES` |

**Chặng C — kiểm proxy có ăn không, dùng proxy free**

> Từ 02/08/2026 MKTTool **tự đẩy proxy** sang profile trước khi mở (`applyProxy` →
> `update_profile`), nên **không cần nhập proxy trong MultiZen nữa**. Chặng C giờ kiểm luôn cả
> đường đẩy tự động đó.

6. Đăng ký [webshare.io](https://www.webshare.io/) bản miễn phí (10 proxy, không cần thẻ).
   Trong bảng điều khiển Webshare, ghi lại **host, port, username, password** và chú ý cổng nào
   là HTTP, cổng nào là SOCKS5 — điền sai cặp cổng/giao thức là profile không nối được.
7. Nhập proxy vào MKTTool (`/proxies`), chọn đúng **Giao thức**. Sửa tài khoản giả cho trỏ vào nó.
8. **Để trống phần proxy trong MultiZen** — nếu MKTTool đẩy đúng thì profile vẫn ra IP proxy.
   Đây chính là phép thử. (Profile còn proxy nhập tay từ trước thì xoá đi rồi hãy thử.)
9. Mở profile → vào `ipinfo.io` → **IP phải khớp proxy Webshare**. Chỉ cần đúng một điều đó.

| Kết quả | Nghĩa là | Làm gì tiếp |
|---|---|---|
| IP khớp proxy | ✅ Đạt — đường đẩy proxy chạy đúng | Ghi kết quả, chuyển Chặng D |
| IP là IP nhà | Profile mở nhưng không ăn proxy | Xem `AuditLog` của nick: có dòng `PROFILE_LAUNCHED` kèm giao thức không. Kiểm tra profile trong MultiZen có nhận proxy sau khi mở không |
| *"…không nhận cấu hình proxy…"* | `update_profile` từ chối | Lý do gốc nằm ngay trong thông báo (đã che mật khẩu). Thường là sai giao thức hoặc sai cổng |
| *"…không có tool cập nhật profile nào…"* | Bản MultiZen đổi tên tool | Thông báo hiện luôn danh sách tool thật — thêm vào `UPDATE_TOOL_NAMES` trong `multizen-adapter.ts` |
| Không mở profile, báo lỗi giải mã | Sai `VAULT_KEY` so với lúc nhập proxy | Nhập lại proxy bằng khóa hiện tại |

> **TUYỆT ĐỐI không đăng nhập tài khoản thật nào ở Chặng B/C**, kể cả nick phụ. Proxy free của
> Webshare là datacenter dùng chung, IP đã nằm trong danh sách đen từ lâu — đăng nhập Facebook
> qua đó gần như chắc chắn ăn checkpoint, và nick phụ dính checkpoint có thể kéo theo nick chính.
>
> **Đừng kỳ vọng điểm ẩn danh Whoer ≥ 90%** với proxy free — nó luôn trừ nặng vì IP thuộc dải
> hosting, đó là bản chất proxy free chứ không phải lỗi cấu hình. Để dành Whoer cho proxy thật.

10. **Ghi kết quả vào `plans/reports/`.** Đây là đầu vào bắt buộc của Phase 05.

## Related Code Files
- ~~`scripts/probe-antidetect-cdp.ts`~~ — không cần nữa, nút "Mở profile" trong app đã là phép thử
- Tạo: bảng tính theo dõi cold-start (Google Sheet, không nằm trong repo)

## Todo List
- [x] Trả lời câu hỏi chặn đường về MultiZen (02/08/2026 — không cần Playwright, không đổi AdsPower)
- [x] **Chặng B: mở profile từ MKTTool — ĐẠT 02/08/2026**
- [x] Đẩy proxy tự động sang antidetect browser (02/08/2026 — `applyProxy`, có test)
- [x] **Chặng C: IP trong profile khớp proxy — ĐẠT 02/08/2026** → [báo cáo](../reports/chang-c-260802-1443-proxy-push-verification.md)
- [ ] Chốt 2-3 subreddit + ghi luật từng sub
- [ ] Mua & test 11 static ISP proxy (mua thử 2 cái trước)
- [ ] Mua 8 nick Reddit + 3 nick FB (đủ checklist)
- [ ] Đổi toàn bộ thông tin khôi phục, bật 2FA, lưu TOTP secret an toàn
- [ ] Tạo 11 profile antidetect, gắn proxy 1:1 **trong MultiZen** rồi mới nhập vào MKTTool
- [ ] Chạy cold-start 14 ngày, ghi log hằng ngày
- [ ] Tổng kết: bao nhiêu nick sống / chết / dính checkpoint

## Success Criteria
- ≥ 6/8 nick Reddit sống, không shadowban sau 14 ngày (kiểm tra bằng chế độ ẩn danh)
- ≥ 2/3 nick FB sống, không dính checkpoint đòi CCCD
- [x] Có kết luận rõ ràng: **dùng MultiZen**, Phase 05 đi qua tool MCP của nó
- Có bảng luật của 2-3 subreddit mục tiêu
- [x] Chặng C: IP trong profile khớp proxy đã cấu hình (02/08/2026)

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Nick mua về chết ngay | Cao | Cao | Mua thử 2 nick trước, sống mới mua tiếp |
| Người bán lấy lại nick | Trung bình | Cao | Bắt buộc có email gốc + đổi hết thông tin trong 1 giờ đầu |
| FB đòi xác minh CCCD | Cao | Cao | Chấp nhận mất nick FB; không phụ thuộc FB cá nhân (xem Phase 04) |
| ~~MultiZen không nối được Playwright~~ | — | — | **Đã giải 02/08/2026**: dùng tool MCP của MultiZen, không cần Playwright |
| ~~Quên gán proxy trong MultiZen, tưởng MKTTool tự đẩy~~ | — | — | **Đã đóng 02/08/2026**: MKTTool đẩy proxy trước khi mở; đẩy hỏng thì không mở profile |
| Proxy hết hạn / bị chặn nhưng vẫn ăn cấu hình | Trung bình | Cao | Đẩy thành công không bảo đảm proxy sống — thông báo sau khi mở vẫn bắt kiểm `ipinfo.io` |
| Sub mục tiêu cấm quảng cáo hoàn toàn | Trung bình | Cao | Đổi sub, hoặc đổi chiến lược sang trả lời câu hỏi thay vì đăng bài |

## Security Considerations
- TOTP secret và mật khẩu tạm lưu ở password manager (1Password/Bitwarden), **không lưu Google Sheet**.
- Sang Phase 01 sẽ chuyển vào kho danh tính có mã hóa.
- Không chia sẻ profile antidetect qua chat/email.

## Next Steps
→ [Phase 01 — Kho danh tính](phase-01-identity-vault.md) (bắt đầu code song song từ ngày 3 của cold-start)
→ [Phase 04 — Facebook Pages](phase-04-facebook-pages-publisher.md) (độc lập, làm bất cứ lúc nào)
