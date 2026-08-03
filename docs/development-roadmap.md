# Lộ trình phát triển

**Cập nhật:** 03/08/2026

Đây là **nguồn duy nhất về trạng thái** của dự án. Bản thiết kế chi tiết từng giai đoạn ở
[plans/](../plans/260801-2030-multi-account-posting-console/plan.md); vì sao làm ở
[project-overview-pdr.md](project-overview-pdr.md).

---

## Trạng thái các giai đoạn

| # | Giai đoạn | Trạng thái | Ngày | Còn thiếu gì |
|---|---|---|---|---|
| 0 | [Chuẩn bị & kiểm chứng khả thi](../plans/260801-2030-multi-account-posting-console/phase-00-preparation-and-feasibility-check.md) | 🟡 Đang chạy | Kiểm chứng xong 02/08 | Mua proxy + nick, chạy 14 ngày cold-start |
| 1 | [Kho danh tính](../plans/260801-2030-multi-account-posting-console/phase-01-identity-vault.md) | ✅ Xong | 01/08 | – |
| 2 | [Hàng đợi content + Bộ luật an toàn](../plans/260801-2030-multi-account-posting-console/phase-02-content-queue-and-safety-rules.md) | ✅ Xong | 02/08 | – |
| 3 | [Theo dõi sức khỏe tài khoản](../plans/260801-2030-multi-account-posting-console/phase-03-account-health-monitor.md) | ✅ Xong | 03/08 | Chưa chạy với proxy quan sát viên + nick Reddit thật |
| 4 | [Facebook Pages publisher](../plans/260801-2030-multi-account-posting-console/phase-04-facebook-pages-publisher.md) | ✅ Xong | 03/08 | – (đã đăng thật lên Fanpage) |
| 5 | [Bán tự động đăng Reddit](../plans/260801-2030-multi-account-posting-console/phase-05-reddit-posting-automation.md) | ⬜ Chưa bắt đầu | – | Chờ Phase 00-03 chạy ổn 2 tuần với thao tác tay |

**Code đi trước phần mua sắm.** Bốn giai đoạn code đã xong trong khi Phase 00 còn chờ tiền và chờ
đồng hồ. Đó là rủi ro đã biết, không phải nhầm lẫn: phần code không có đường rút ngắn 14 ngày
cold-start, nên làm trước là đúng.

## Đường găng: cái gì đang chặn

| Chặn | Bản chất | Ai gỡ được |
|---|---|---|
| **Mua proxy tĩnh + nick** | Tiền (3-8 triệu một lần) | Người quyết ngân sách |
| **14 ngày cold-start** | Đồng hồ thật, không rút ngắn | Không ai — chỉ chờ |
| **Mua proxy quan sát viên** | Tiền, 1 IP riêng, không đăng nhập nick nào | Người quyết ngân sách |

Mỗi ngày chưa mua nick là một ngày lùi ngày đăng bài đầu tiên. Phase 05 không nên bắt đầu trước
khi ba chặn trên gỡ xong — tự động hóa lên nick chưa qua cold-start là cách giết nick nhanh nhất.

## Đã kiểm chứng bằng thực tế

Danh sách này là ranh giới giữa "code có chạy" và "đã chạy thật". Bảng đầy đủ kèm bằng chứng ở
[README](../README.md#đã-kiểm-chứng-bằng-thực-tế).

| Việc | Ngày |
|---|---|
| Mở profile antidetect qua MCP | 02/08/2026 |
| Đẩy proxy vào profile, IP trong profile khớp proxy | 02/08/2026 |
| Bộ dò shadowban đọc HTML Reddit thật (bắt được 2 lỗi parser) | 03/08/2026 |
| Đăng thật lên Fanpage qua Graph API | 03/08/2026 |

**Chưa kiểm chứng:** đăng bằng nick Reddit thật, và lượt `npm run health` đầy đủ với nick thật +
proxy quan sát viên.

## Mốc tiếp theo

| Mốc | Điều kiện đạt |
|---|---|
| **M1 — Kho danh tính có nick thật** | 8 nick Reddit + 3 nick FB đã nhập, mỗi nick một proxy tĩnh, cold-start đang chạy |
| **M2 — Bài đầu tiên lên Reddit** | Hết cold-start, xếp lịch qua hàng đợi, bộ luật cho qua, đăng tay thành công |
| **M3 — Vận hành đều 2 tuần** | 15-20 bài/ngày, không nick nào bị ẩn, `npm run health` chạy hằng ngày |
| **M4 — Bắt đầu Phase 05** | M3 đạt, có đủ dữ liệu tương tác để bộ luật đụng độ thread có nghĩa |

## Tiêu chí thành công tổng thể

- 6/8 nick Reddit sống và không shadowban sau 8 tuần
- Bạn MKT đăng được 15-20 bài/ngày trong ~1 tiếng
- 0 lần đăng trùng nội dung giữa 2 nick cùng nền tảng
- Có số liệu lead thật quy về được từng nick

## Rủi ro còn mở

| Rủi ro | Vì sao đáng lo | Đang xử lý bằng |
|---|---|---|
| **Nguồn nick kém** | Nick mua về chết trong 2 tuần đầu | Phase 00 tồn tại để phát hiện sớm, trước khi đổ content vào |
| **Content không đủ** | 3 người viết không nuôi nổi nhiều nick | Đã hạ quy mô xuống 5-8 nick |
| **Reddit mod là người thật** | Không có giải pháp kỹ thuật | Phụ thuộc chất lượng nội dung, không phụ thuộc công cụ |
| **Cold-start chưa chạy** | Đường găng thật, code đã đi trước khá xa | Không có cách nào ngoài mua nick sớm |
| **Reddit đổi giao diện** | Bộ dò đọc HTML `old.reddit.com` sẽ hỏng | Hỏng thì báo "Không dò được", không bao giờ báo "khỏe"; `npm run health:smoke` đối chiếu Reddit thật |

Rủi ro **"MultiZen chưa kiểm chứng"** đã đóng ngày 02/08/2026: mở profile được, đẩy proxy tự động
được, IP khớp. Adapter AdsPower vẫn giữ (không tốn gì) nhưng không còn là phương án dự phòng bắt buộc.

## Ngân sách

| Khoản | Một lần | Hàng tháng |
|---|---|---|
| Nick Reddit cổ (8 cái) | 2-5 triệu | – |
| Nick FB (3 cái) | 1-3 triệu | – |
| Proxy tĩnh (11 IP) | – | ~700k |
| Antidetect browser (MultiZen) | 0đ | 0đ |
| Máy chạy | dùng máy sẵn có | 0đ |
| Thay nick hao hụt | – | ~500k-1tr |
| **Tổng** | **3-8 triệu** | **~1,2-1,7 triệu** |
