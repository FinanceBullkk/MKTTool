# docs/archive — Tài liệu bản cũ

Thư mục này có **hai loại file, đừng lẫn chúng với nhau**:

| File | Là gì |
|---|---|
| `Technical_Analysis_And_Risk_Assessment.md`, `X_Twitter_Automation_Blueprint.md` | **bản trước khi xoay hướng** (tháng 7/2026) — hướng đi đã bỏ |
| [`project-changelog-07-to-11-august-2026.md`](project-changelog-07-to-11-august-2026.md), [`project-changelog-05-to-06-august-2026.md`](project-changelog-05-to-06-august-2026.md), [`project-changelog-den-04-08-2026.md`](project-changelog-den-04-08-2026.md) | Historical sections of the current product changelog, not superseded design material |
| [`development-roadmap-historical-pre-consolidation.md`](development-roadmap-historical-pre-consolidation.md) | Historical section of the current roadmap — pre-consolidation stream tables and critical path, split out 2 September 2026. Same kind as the changelog rows above, not superseded design material |

Phần còn lại của trang này nói về **loại thứ nhất**.

> **Không dùng hai file của bản cũ làm căn cứ cho quyết định hiện tại.**
> Thiết kế, quy mô, stack kỹ thuật và chiến thuật proxy đã thay đổi toàn bộ.

## So sánh bản cũ với hiện tại

| Hạng mục | Bản cũ (2 file này) | Dự án thật hiện nay |
|---|---|---|
| Quy mô nick | 50+ nick | 5-8 nick Reddit, 1-3 Fanpage Facebook |
| Nền tảng chính | Twitter/X, TikTok | Reddit ~80%, Facebook phụ |
| Hạ tầng | VPS Linux + Docker + microservices | Máy bàn, một process Next.js |
| Điều khiển browser | Playwright trực tiếp | Tool MCP của MultiZen |
| Proxy | IPRoyal tính theo GB (residential) | Static ISP tính theo IP, gắn 1:1 với nick |

## Lý do xoay hướng

Theo đúng 5 rủi ro mà chính `Technical_Analysis_And_Risk_Assessment.md` nêu ra:

1. **Bẫy chi phí proxy dân cư tính theo GB** — ước tính ~5,4 triệu/tháng riêng tiền proxy,
   cao gấp nhiều lần dự trù ban đầu. Chuyển sang static ISP tính theo IP.
2. **Nghẽn RAM/CPU trên VPS** — 50+ profile Chromium cùng lúc không khả thi trên một VPS.
3. **Đánh giá chủ quan rào cản anti-bot** giữa các nền tảng.
4. **Tính ổn định của MultiZen và xung đột multi-user** chưa được kiểm chứng.
5. **Thiếu luồng xử lý captcha, OTP/2FA và dò shadowban** — phần khó nhất bị bỏ qua.

Ngoài ra, 50+ nick đòi cả một đội vận hành chứ không phải 1 người, nên quy mô được hạ xuống
5-8 nick. VPS + Docker + microservices là over-engineering cho 1 người dùng trên 1 máy.
