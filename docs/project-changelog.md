# Nhật ký thay đổi

Ghi theo ngày, gom theo giai đoạn. Chỉ ghi thứ đổi hành vi của công cụ — không ghi việc dọn dẹp
nội bộ. Trạng thái hiện tại ở [development-roadmap.md](development-roadmap.md).

Dự án chưa phát hành phiên bản (`0.1.0`, dùng nội bộ). Mốc chia theo giai đoạn, không theo semver.

---

## 03/08/2026 — Phase 03 + Phase 04 nghiệm thu bằng thực tế

**Tính năng**

- **Dò shadowban Reddit + theo dõi karma** từ góc nhìn người ngoài: phiên trình duyệt sạch qua
  proxy quan sát viên, parser HTML `old.reddit.com`, biểu đồ karma 30 ngày, lịch sử từng lượt dò
  (`npm run health`, nút "Dò lại ngay").
- **Luật 10** — chặn job khi lần dò gần nhất kết luận nick đang bị ẩn.
- **Tự dọn ảnh chụp màn hình cũ hơn 30 ngày** ở cuối mỗi lượt dò; chỉ giữ ảnh khi kết luận khác
  "khỏe". Bản ghi kết luận giữ vĩnh viễn.
- **Facebook Login for Business** qua `config_id` — nick doanh nghiệp kết nối được.
- **Nick Facebook không còn bắt buộc proxy và profile antidetect.** Fanpage đăng bằng Graph API
  nên không mở trình duyệt. Ràng buộc "hai nick không dùng chung một proxy thật" vẫn nguyên.
- **Nhắc việc đăng tay dùng chung cho Reddit và Facebook Group** — trước chỉ có Group. Đích nào
  chưa có bộ đăng tự động thì mặc định rơi vào nhắc việc, không im lặng biến mất.
- **`npm run db:upgrade`** — nhận bản mới an toàn: kiểm tra có thay đổi cấu trúc database không,
  có thì sao lưu trước rồi mới áp, hỏng thì chỉ luôn tên file sao lưu để chép đè về.

**Sửa lỗi**

- Bộ dò không còn kết luận "khỏe" khi không có bài nào để đối chiếu — trường hợp này giờ là cảnh báo.
- Hai lượt dò không chạy chồng nhau nữa (file khóa `data/health-check.lock`, tự nhả sau 30 phút
  nếu tiến trình chết ngang).
- Chặn OAuth khi địa chỉ mở app lệch redirect URI đã đăng ký.
- Sửa số hiệu luật ghi sai trong code (nhãn hiển thị lệch so với tài liệu).
- Dọn ba cảnh báo set-state-in-effect và cảnh báo hydrate do extension trình duyệt chèn attribute.

**Kiểm chứng thật:** đăng bài lên Fanpage nháp qua Graph API — job chuyển `POSTED` kèm URL thật,
`Interaction` tự ghi, `AuditLog` ghi `FACEBOOK_PAGE_PUBLISHED`. Bộ dò đọc Reddit thật bắt được
2 lỗi parser (`npm run health:smoke` 17/17).

**Tài liệu:** báo cáo [code review toàn codebase](../plans/reports/code-review-260803-0303-toan-bo-codebase.md),
[security review](../plans/reports/security-review-260803-0443-phase-03-va-toan-he-thong.md),
[audit bàn giao team](../plans/reports/audit-260803-0627-ban-giao-team-dung-thu.md).

---

## 02/08/2026 — Phase 04 + vá bảo mật + sửa/xóa dữ liệu

**Tính năng**

- **Đăng Fanpage qua Graph API**: OAuth → token 60 ngày → Page token, tự tạo đích đăng, nút "Đăng
  lên Page" trong hàng đợi, chấm sức khỏe token trước khi gọi mạng.
- **Sửa và xóa được** nhân vật, proxy, nick, đích đăng, content. Xóa bị chặn khi còn job/tương tác
  trỏ tới; sửa xong là bộ luật tự chấm lại mọi job đang chờ.
- **Đẩy proxy vào profile antidetect trước khi mở** — đẩy hỏng thì không mở, tránh chạy bằng IP nhà.
- **Nhập hàng loạt proxy** từ file nhà cung cấp (`npm run proxies:import`).
- **Bộ luật áp theo nền tảng** — luật nào vô nghĩa với nền tảng nào thì không chạy, thay vì chạy
  rồi cho qua.

**Bảo mật**

- App chỉ nghe `127.0.0.1`, không ra LAN (`next dev -H 127.0.0.1`).
- Đối chiếu `Origin` cho mọi route handler trong `api/`.
- Vá lỗ cho phép ghi đè luật đụng độ thread — luật 8 không bao giờ được ghi đè.
- Lỗi giải mã credential không còn im lặng.

**Sửa lỗi**

- Job đã lên tường Facebook không còn bị đẩy về `FAILED` vì lỗi ở bước sau.
- Phân biệt hai thread Facebook có cùng path.
- Không lật được trạng thái job đã chốt; lịch gom theo ngày có năm.
- Bắt tay lại với MultiZen khi app antidetect khởi động lại giữa chừng.

**Kiểm chứng thật:** Chặng B (mở profile) và Chặng C (đẩy proxy, IP khớp) — kèm phát hiện **rò
WebRTC** cần luật firewall, ghi ở [báo cáo Chặng C](../plans/reports/chang-c-260802-1443-proxy-push-verification.md).

---

## 01-02/08/2026 — Phase 01 + Phase 02: nền móng

- **Kho danh tính**: nick + proxy + vân tay + nhân vật, ép 1:1 bằng ràng buộc database, credential
  mã hóa AES-256-GCM, sinh mã TOTP, mở profile antidetect bằng 1 click.
- **Hàng đợi content + bộ luật an toàn**: 10 luật, mỗi luật một file hàm thuần; chấm realtime
  ngay lúc xếp lịch; ghi đè phải nhập lý do và để lại `AuditLog`.
- **Từ điển thuật ngữ + bản đồ mã nguồn**; hai tài liệu bản trước khi xoay hướng đưa vào
  [archive/](archive/README.md).
- **MCP client tới MultiZen** dùng bearer token, bỏ yêu cầu endpoint CDP (MultiZen không phơi CDP —
  đó là bình thường, Phase 05 sẽ lái bằng chính tool MCP).

---

## Trước 01/08/2026 — xoay hướng

Bản đầu (tháng 7/2026) nhắm 50+ nick Twitter/X trên VPS + Docker + microservices, proxy dân cư
tính theo GB. Bản phản biện rủi ro tính ra riêng tiền proxy ~5,4 triệu/tháng và chỉ ra 5 rủi ro
chưa có lời giải. Kết quả: hạ quy mô xuống 5-8 nick Reddit + 1-3 Fanpage, chạy trên máy bàn, proxy
tĩnh tính theo IP. Chi tiết ở [archive/README.md](archive/README.md).
