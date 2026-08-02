# Multi-Account Posting Console (MKTTool)

Công cụ cho 1 bạn MKT specialist vận hành nhiều tài khoản mạng xã hội để đăng content của team
mà không bị shadowban / bóp tương tác.

**Ngày lập:** 2026-08-01 | **Trạng thái:** GĐ1 + GĐ2 xong, GĐ4 xong phần khung, đang chờ mua nick | **Branch:** master

---

## Bối cảnh

| Hạng mục | Chốt |
|---|---|
| Nền tảng | **Reddit** (chính, 80% công sức) + **Facebook** (phụ) |
| Quy mô GĐ1 | 5-8 nick Reddit, 1-3 Fanpage FB, 2-3 nick cá nhân FB |
| Người vận hành | 1 MKT specialist |
| Nguồn content | Team 3 người tự viết, đã có pipeline riêng |
| Mục tiêu | Tăng nhận diện thương hiệu + kiếm lead |
| Không làm | Auto-DM, reply hijacking, AI sinh content |

## Quyết định kiến trúc cốt lõi

1. **Console trước, tự động sau.** Giá trị nằm ở quản lý danh tính + bộ luật an toàn (90% lợi ích,
   20% công sức, ~0 rủi ro), không nằm ở bot chạy 24/7.
2. **Chạy trên desktop, chưa cần VPS.** MultiZen/AdsPower là app desktop → bỏ được Docker/Xvfb/VPS ở GĐ1.
3. **Reddit bắt buộc dùng browser.** API free cấm mục đích thương mại; API thương mại $12k/tháng.
4. **Facebook Pages dùng Graph API chính thức.** Miễn phí, hợp lệ, không bao giờ bị khóa.
5. **Facebook Group không tự động hóa được.** Groups API bị Meta khai tử 04/2024. Làm tay.
6. **SQLite + Prisma**, không Postgres/Redis ở GĐ1. Migrate sau nếu lên VPS.

## Tech stack

Next.js (App Router) + TypeScript + Prisma + SQLite + MCP client tới MultiZen (antidetect browser).
Một process, một câu lệnh `npm run dev`. Không microservice.

## Các giai đoạn

| # | Giai đoạn | Thời lượng | Trạng thái | File |
|---|---|---|---|---|
| 0 | Chuẩn bị & kiểm chứng khả thi | 2 tuần | 🟡 Phần kiểm chứng xong 02/08/2026 (Chặng B + C đạt). Còn mua proxy/nick + 14 ngày cold-start | [phase-00](phase-00-preparation-and-feasibility-check.md) |
| 1 | Kho danh tính | 5-7 ngày | ✅ Xong 01/08/2026 | [phase-01](phase-01-identity-vault.md) |
| 2 | Hàng đợi content + Bộ luật an toàn | 7-10 ngày | ✅ Xong 02/08/2026 | [phase-02](phase-02-content-queue-and-safety-rules.md) |
| 3 | Theo dõi sức khỏe tài khoản | 4-5 ngày | ⬜ | [phase-03](phase-03-account-health-monitor.md) |
| 4 | Facebook Pages publisher | 2-3 ngày | 🟡 Khung xong 02/08/2026, chờ Meta App để đăng thử thật | [phase-04](phase-04-facebook-pages-publisher.md) |
| 5 | Bán tự động đăng Reddit | 7-10 ngày | ⬜ | [phase-05](phase-05-reddit-posting-automation.md) |

**Tổng: ~6-8 tuần** (2 tuần GĐ0 chạy song song được với GĐ1).

## Phụ thuộc

```
GĐ0 (mua proxy → mua nick → cold start → test CDP)
 │
 ├─→ GĐ1 (kho danh tính) ──→ GĐ2 (bộ luật) ──→ GĐ3 (sức khỏe) ──→ GĐ5 (tự động Reddit)
 │
 └─→ GĐ4 (FB Pages API) — độc lập, làm song song bất cứ lúc nào
```

**Chặn đường:** ~~"Playwright có nối được MultiZen không?"~~ — **đã giải 02/08/2026**: MultiZen phơi
tool điều khiển qua MCP (`navigate`/`click`/`type`/`extract`/`screenshot`), nên GĐ5 dùng thẳng
đường đó, bỏ Playwright, không phải chuyển AdsPower. Chi tiết ở
[phase-00](phase-00-preparation-and-feasibility-check.md).

Chặn đường còn lại của GĐ0 là **mua proxy + nick + 14 ngày cold-start** — đồng hồ thật, không
rút ngắn được.

## Ngân sách

| Khoản | Một lần | Hàng tháng |
|---|---|---|
| Nick Reddit cổ (8 cái) | 2-5 triệu | – |
| Nick FB (3 cái) | 1-3 triệu | – |
| Proxy tĩnh (11 IP) | – | ~700k |
| Antidetect browser | 0đ (MultiZen MIT) | 0đ |
| Máy chạy | dùng máy sẵn có | 0đ |
| Thay nick hao hụt | – | ~500k-1tr |
| **Tổng** | **3-8 triệu** | **~1,2-1,7 triệu** |

## Tiêu chí thành công tổng thể

- 6/8 nick Reddit sống và không shadowban sau 8 tuần
- Bạn MKT đăng được 15-20 bài/ngày trong ~1 tiếng
- 0 lần đăng trùng nội dung giữa 2 nick cùng nền tảng
- Có số liệu lead thật quy về được từng nick

## Rủi ro lớn nhất

1. **Nguồn nick kém** — nick mua về chết trong 2 tuần đầu → GĐ0 tồn tại để phát hiện sớm.
2. **Content không đủ** — 3 người không nuôi nổi nhiều nick → đã hạ quy mô xuống 5-8.
3. **Reddit mod là người thật** — không có giải pháp kỹ thuật; phụ thuộc chất lượng nội dung.
4. ~~**MultiZen chưa kiểm chứng**~~ — **đã kiểm chứng 02/08/2026**: mở profile được, đẩy proxy tự
   động được, IP trong profile khớp proxy. Không cần phương án dự phòng AdsPower nữa (adapter vẫn
   giữ, không tốn gì).
5. **Đồng hồ cold-start chưa chạy** — rủi ro lớn nhất còn lại và là đường găng thật. Code đã đi
   trước phần mua nick khá xa; mỗi ngày chưa mua là một ngày lùi ngày đăng bài đầu tiên.
