# Tài liệu MKTTool — bắt đầu từ đâu

**Cập nhật:** 03/08/2026

Repo này có 12+ file tài liệu. Đừng đọc hết. Tra theo câu hỏi bạn đang có:

| Bạn muốn biết | Đọc file |
|---|---|
| Cài và chạy công cụ, dùng từng màn hình | [../README.md](../README.md) — cẩm nang vận hành, đọc trước tiên |
| Dự án giải quyết vấn đề gì, cho ai, không làm gì | [project-overview-pdr.md](project-overview-pdr.md) |
| "Shadowban", "cold-start", "proxy quan sát viên" nghĩa là gì | [domain-glossary.md](domain-glossary.md) |
| Làm tới đâu rồi, tiếp theo làm gì, cái gì đang chặn | [development-roadmap.md](development-roadmap.md) |
| Đã đổi những gì, ngày nào | [project-changelog.md](project-changelog.md) |
| Đưa web lên máy chủ thật (Railway) | [deployment-guide.md](deployment-guide.md) |
| Hệ thống chạy ở đâu, phụ thuộc cái gì, hỏng thì hỏng thế nào | [system-architecture.md](system-architecture.md) |
| Code nằm ở đâu, luồng nào gọi file nào | [codebase-summary.md](codebase-summary.md) |
| Quy ước viết code, test, commit trước khi đóng góp | [code-standards.md](code-standards.md) |

## Ba vai, ba đường đọc

**Bạn MKT sắp dùng công cụ:** [../README.md](../README.md) → mục *Thứ tự nhập liệu* → *Bộ luật an
toàn* → *Đăng bài*. Không cần đọc gì trong `docs/`.

**Dev mới nhận repo:** [project-overview-pdr.md](project-overview-pdr.md) →
[system-architecture.md](system-architecture.md) → [codebase-summary.md](codebase-summary.md) →
[code-standards.md](code-standards.md). Mở [domain-glossary.md](domain-glossary.md) sẵn ở tab bên.

**Người quyết định (PM/lead):** [project-overview-pdr.md](project-overview-pdr.md) →
[development-roadmap.md](development-roadmap.md) → mục *Đã kiểm chứng bằng thực tế* cuối
[../README.md](../README.md).

## Bản thiết kế chi tiết từng giai đoạn

Đặc tả thi công nằm ở [plans/260801-2030-multi-account-posting-console/](../plans/260801-2030-multi-account-posting-console/plan.md):
mỗi giai đoạn một file, kèm yêu cầu, kiến trúc, các bước, tiêu chí nghiệm thu.

**Quy ước:** file trong `plans/` là bản ghi tại thời điểm lập kế hoạch + phần "đã làm khác kế
hoạch" bổ sung sau. Không viết lại lịch sử ở đó. Trạng thái mới nhất luôn ở
[development-roadmap.md](development-roadmap.md).

## Báo cáo rà soát & kiểm chứng

Bằng chứng cho các tuyên bố "đã chạy thật" — không phải tài liệu thiết kế:

| Báo cáo | Nội dung |
|---|---|
| [audit — bàn giao team dùng thử](../plans/reports/audit-260803-0627-ban-giao-team-dung-thu.md) | Rà soát chức năng/nghiệp vụ trước khi giao team, 03/08/2026 |
| [security review](../plans/reports/security-review-260803-0443-phase-03-va-toan-he-thong.md) | Rà soát bảo mật Phase 03 + toàn hệ thống |
| [code review toàn codebase](../plans/reports/code-review-260803-0303-toan-bo-codebase.md) | Rà soát chất lượng mã, 03/08/2026 |
| [Chặng C — đẩy proxy](../plans/reports/chang-c-260802-1443-proxy-push-verification.md) | Đo thật: proxy vào đúng profile, phát hiện rò WebRTC |
| [Phản biện đánh giá rủi ro](../plans/reports/review-260801-1951-gemini-risk-assessment-critique.md) | Phản biện bản phân tích rủi ro cũ — nguồn gốc của quyết định xoay hướng |

## Tài liệu bản cũ

[archive/](archive/README.md) giữ hai tài liệu trước khi xoay hướng (tháng 7/2026: 50+ nick,
Twitter/X, VPS + Docker). **Không dùng làm căn cứ cho quyết định hiện tại** — file
[archive/README.md](archive/README.md) giải thích rõ đã bỏ gì và vì sao.

Cùng thư mục còn
[phần nhật ký thay đổi tới hết 04/08/2026](archive/project-changelog-den-04-08-2026.md), cắt ra
ngày 06/08/2026 khi file sống chạm ngưỡng 800 dòng. File đó **vẫn là lịch sử của dự án hiện tại**
— khác hẳn hai file trên — chỉ là phần đã cũ đủ để không cần mở mỗi ngày.
