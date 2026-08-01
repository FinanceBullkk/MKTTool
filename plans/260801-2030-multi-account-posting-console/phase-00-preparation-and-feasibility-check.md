# Phase 00 — Chuẩn bị & Kiểm chứng khả thi

**Không viết dòng code sản phẩm nào ở giai đoạn này.**

## Context Links
- [plan.md](plan.md)
- [Báo cáo review rủi ro](../reports/review-260801-1951-gemini-risk-assessment-critique.md)

## Overview
- **Priority:** P0 — chặn đường mọi giai đoạn sau
- **Status:** ⬜ Chưa bắt đầu
- **Thời lượng:** 2 tuần (chủ yếu là chờ, không phải làm)
- **Mục đích:** Trả lời 2 câu hỏi có thể giết dự án, TRƯỚC khi đầu tư công sức code.

## Key Insights

1. **Thứ tự bắt buộc: proxy TRƯỚC, nick SAU.** Nick cổ đăng nhập lần đầu từ IP sai quốc gia →
   điểm tin cậy phiên rớt về gần 0 → checkpoint ngay. Không có proxy đúng nước thì đừng mua nick.
2. **Không có email gốc thì không mua.** Người bán giữ email gốc = lấy lại nick bất cứ lúc nào
   bằng chức năng "quên mật khẩu", kể cả sau khi bạn đã nuôi nick 3 tháng.
3. **Nick mua về không dùng được ngay.** Cần 7-14 ngày chỉ đọc, không đăng, không đổi thông tin.
4. **Reddit shadowban dễ kiểm tra:** mở `reddit.com/user/<tên>` ở chế độ ẩn danh. Trống/404 = bị ẩn.
5. Câu hỏi kỹ thuật chặn đường: **Playwright có `connectOverCDP` được vào MultiZen không?**
   MultiZen dùng CDP nội bộ nhưng không có tài liệu về endpoint ngoài.

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
2. Số lượng: 11 IP (1 IP : 1 nick, không dùng chung).
3. Quốc gia: khớp với quốc gia của nick sẽ mua (hỏi người bán nick trước).
4. Test từng proxy: tốc độ, có bị Reddit/FB chặn sẵn không (mở thử ở chế độ ẩn danh).

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

### Bước 5 — Test MultiZen ↔ Playwright (1 ngày, làm song song)
1. Cài MultiZen, tạo 1 profile test.
2. Thử `chromium.connectOverCDP('http://127.0.0.1:<port>')` — dò port MultiZen mở.
3. Nếu không được, thử gọi MCP server tại `127.0.0.1:7777` để lấy CDP endpoint.
4. Nếu vẫn không được → cài AdsPower bản free, test local API `/api/v1/browser/start`
   (trả về `ws://` endpoint dùng cho `connectOverCDP`).
5. **Ghi kết quả vào `plans/reports/`.** Đây là đầu vào bắt buộc của Phase 05.

## Related Code Files
- Tạo: `scripts/probe-antidetect-cdp.ts` — script test 1 lần, ~50 dòng, không thuộc sản phẩm
- Tạo: bảng tính theo dõi cold-start (Google Sheet, không nằm trong repo)

## Todo List
- [ ] Chốt 2-3 subreddit + ghi luật từng sub
- [ ] Mua & test 11 static ISP proxy
- [ ] Mua 8 nick Reddit + 3 nick FB (đủ checklist)
- [ ] Đổi toàn bộ thông tin khôi phục, bật 2FA, lưu TOTP secret an toàn
- [ ] Tạo 11 profile antidetect, gắn proxy 1:1
- [ ] Chạy cold-start 14 ngày, ghi log hằng ngày
- [ ] Test Playwright ↔ MultiZen, viết report kết luận
- [ ] Tổng kết: bao nhiêu nick sống / chết / dính checkpoint

## Success Criteria
- ≥ 6/8 nick Reddit sống, không shadowban sau 14 ngày (kiểm tra bằng chế độ ẩn danh)
- ≥ 2/3 nick FB sống, không dính checkpoint đòi CCCD
- Có kết luận rõ ràng: dùng MultiZen hay chuyển AdsPower
- Có bảng luật của 2-3 subreddit mục tiêu

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Nick mua về chết ngay | Cao | Cao | Mua thử 2 nick trước, sống mới mua tiếp |
| Người bán lấy lại nick | Trung bình | Cao | Bắt buộc có email gốc + đổi hết thông tin trong 1 giờ đầu |
| FB đòi xác minh CCCD | Cao | Cao | Chấp nhận mất nick FB; không phụ thuộc FB cá nhân (xem Phase 04) |
| MultiZen không nối được Playwright | Trung bình | Trung bình | Dự phòng AdsPower/GoLogin |
| Sub mục tiêu cấm quảng cáo hoàn toàn | Trung bình | Cao | Đổi sub, hoặc đổi chiến lược sang trả lời câu hỏi thay vì đăng bài |

## Security Considerations
- TOTP secret và mật khẩu tạm lưu ở password manager (1Password/Bitwarden), **không lưu Google Sheet**.
- Sang Phase 01 sẽ chuyển vào kho danh tính có mã hóa.
- Không chia sẻ profile antidetect qua chat/email.

## Next Steps
→ [Phase 01 — Kho danh tính](phase-01-identity-vault.md) (bắt đầu code song song từ ngày 3 của cold-start)
→ [Phase 04 — Facebook Pages](phase-04-facebook-pages-publisher.md) (độc lập, làm bất cứ lúc nào)
