# Phase 06 — Bàn giao team

## Context

- [plan.md](plan.md) — quyết định 8 (bàn giao một lần)
- Phụ thuộc: tất cả các phase trước

## Overview

**Ưu tiên:** cao | **Trạng thái:** chưa làm | **Dự kiến:** 2-3 ngày

Đưa công cụ vào tay 5-6 người: cài máy, nhập dữ liệu, dạy dùng, viết tài liệu vận hành.

Phase này thường bị coi nhẹ và thường là chỗ dự án chết. Team low-tech nghĩa là **thứ không được
dạy rõ sẽ không được làm**, và thứ không được làm sẽ làm bộ luật mù.

## Key Insights

- Có ba việc **hỏng trong im lặng**, phải dạy bằng lời chứ tài liệu không đủ:
  1. Không bấm **"Đã đăng"** → luật 8 không có gì để so, bộ dò không có bài để đối chiếu
  2. Tự nâng cấp MultiZen → luật firewall WebRTC hết tác dụng, IP nhà rò qua UDP
  3. Không kiểm IP sau khi mở profile → proxy chết vẫn ăn cấu hình bình thường
- ⚠️ **Luật firewall WebRTC có đường hỏng thứ hai, không phải chỉ nâng cấp MultiZen: profile
  firewall của mạng đang dùng bị TẮT.** Luật vẫn hiện ra `Enabled: True` nên nhìn qua tưởng còn
  sống, nhưng Windows không lọc gì cả trên profile đã tắt. Đo trên máy dev 05/08/2026: profile
  **Private đang tắt hẳn**, chỉ thoát vì mạng đang được xếp loại Public. Người dùng bấm "Cho phép
  máy này được phát hiện" một lần là mạng chuyển sang Private và lớp chặn biến mất không báo.
  → Bước cài phải kiểm **cả hai**: luật có tồn tại, VÀ profile đang dùng có bật.
- Nick Reddit/TikTok cần MultiZen; người chỉ làm Fanpage thì **không cài gì cả** ngoài trình duyệt.
  Chia nhóm khi đào tạo, đừng bắt mọi người ngồi nghe hết.
- **Chỉ 1-2 người vận hành Reddit** → chỉ 1-2 máy phải cài. Phần nặng nhất của phase này nhỏ hơn
  dự kiến ban đầu. Sẽ nở ra khi TikTok vào, nên cách cài phải viết thành tài liệu lặp lại được,
  đừng làm kiểu nhớ trong đầu.
- Dữ liệu cũ nhỏ (3 nick, 10 proxy, 3 đích) → nhập tay, không cần script.

## Requirements

1. Mỗi người đăng nhập được và thấy đúng phần việc của mình
2. Máy người làm Reddit/TikTok: MultiZen + cầu nối + luật firewall WebRTC, đã đo lại
3. Dữ liệu thật đã có trên hệ thống mới, Fanpage đã nối lại
4. Tài liệu vận hành nằm trong `docs/`, không nằm trong đầu ai

## Architecture

Không có gì mới. Phase này là quy trình, không phải code.

## Related Code Files

**Tạo:** `docs/huong-dan-van-hanh-cho-team.md` — cẩm nang cho người dùng cuối
**Sửa:** [README.md](../../README.md) — cách chạy đổi hoàn toàn; phần `-H 127.0.0.1` không còn đúng
**Sửa:** `docs/deployment-guide.md`, `docs/system-architecture.md`,
`docs/development-roadmap.md`, `docs/project-changelog.md`

## Implementation Steps

1. Khai danh sách email cho phép; tạo tài khoản; gán vai trò
2. Nhập tay: nhân vật, proxy, nick, đích. Phân công chủ sở hữu từng nick
3. Nối lại Fanpage bằng OAuth; kiểm token tất cả Page
4. Nhập proxy quan sát viên (**chưa từng có** — bộ dò chưa chạy thật lần nào với nick thật)
5. Với từng máy làm Reddit/TikTok, qua remote desktop:
   - cài MultiZen, lấy bearer token MCP
   - cài cầu nối bằng `setup.bat`, dán khóa operator + chữ ký công khai máy chủ
   - tạo luật firewall WebRTC, **kiểm profile mạng đang dùng có BẬT firewall không**
     (`Get-NetFirewallProfile` + `Get-NetConnectionProfile`), rồi **đo lại** candidate `srflx` bằng 0
   - **bấm "Cho phép" hộ ở hộp xin quyền mạng nội bộ** (QĐ 10) — bấm nút "Mở profile" một lần
     ngay trong buổi cài, đừng để người dùng gặp hộp này lần đầu khi ngồi một mình
   - mở một profile, vào `ipinfo.io`, xác nhận IP khớp proxy
6. Đào tạo nhóm Fanpage/content (~30 phút): đăng nhập, kho content, xếp lịch, đọc đèn luật
7. Đào tạo nhóm Reddit/TikTok (~60 phút): thêm phần mở profile, copy mật khẩu, OTP, và
   **ba việc hỏng trong im lặng** ở mục Key Insights
8. Viết `docs/huong-dan-van-hanh-cho-team.md`; cập nhật README và docs
9. Chạy thử một vòng thật đầu-cuối: xếp lịch → mở profile → đăng → bấm "Đã đăng" → ghi tương tác
10. Ghi vào tài liệu quy trình **khi có người rời team**: thu hồi tài khoản + xoay khóa operator
    trên mọi máy

## Todo List

- [ ] Danh sách email + tài khoản + vai trò
- [ ] Nhập tay nhân vật / proxy / nick / đích, phân công chủ sở hữu
- [ ] Nối lại Fanpage, kiểm token
- [ ] Nhập proxy quan sát viên
- [ ] Cài từng máy Reddit/TikTok (MultiZen + cầu nối + firewall + đo lại + cấp quyền mạng nội bộ)
- [ ] Tài liệu vận hành có ảnh hộp xin quyền — dùng làm **đường cấp lại**, không phải cấp lần đầu
- [ ] Đào tạo nhóm Fanpage/content
- [ ] Đào tạo nhóm Reddit/TikTok
- [x] `docs/huong-dan-van-hanh-cho-team.md` (06/08/2026) — 348 dòng, viết cho **người dùng cuối**
  chứ không phải người cài: chia hai nhóm ngay đầu file (Fanpage chỉ cần Chrome / Reddit cần
  MultiZen + cầu nối) và nói rõ nhóm nào đọc mục nào. Ba việc hỏng trong im lặng nằm ở một mục
  riêng, kèm **phép tự kiểm hằng tuần** cho việc thứ nhất: số nick trong ô "Chưa đối chiếu được"
  phải bằng 0. Còn thiếu ảnh chụp màn hình — đã ghi thành checklist mở ở cuối file, không để lặng lẽ
- [ ] Cập nhật README + deployment-guide + system-architecture + roadmap + changelog
- [ ] Chạy thử một vòng thật đầu-cuối
- [ ] Ghi quy trình khi có người rời team

## Success Criteria

- **Một người trong team tự làm trọn một bài đăng** từ xếp lịch tới ghi tương tác, không hỏi ai
- Người làm Fanpage đăng được mà **không cài gì ngoài trình duyệt**
- Mọi máy Reddit đo lại xong: IP khớp proxy, candidate `srflx` bằng 0
- `npm run health` chạy trên Railway ra kết quả thật cho nick thật — **lần đầu tiên**
- Hỏi bất kỳ ai trong team "khi nào phải bấm Đã đăng" → trả lời đúng

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Team không bấm "Đã đăng" → luật 8 và bộ dò cùng mù | **cao** | Dạy bằng lời; ô "Chưa đối chiếu được" ở `/health` là còi báo — dạy đọc nó hằng tuần |
| Ai đó tự nâng cấp MultiZen | cao | Nói rõ khi đào tạo + ghi trong tài liệu; hẹn kiểm lại định kỳ |
| Cài máy lâu hơn dự kiến | **thấp** | Chỉ 1-2 máy. Nhưng phải viết thành tài liệu lặp lại được cho đợt TikTok |
| Bộ dò lần đầu chạy với nick thật ra kết quả lạ | trung bình | `npm run health:smoke` chạy trước để loại trừ lỗi parser |

## Security Considerations

- Khóa operator phát qua password manager dùng chung, **không qua chat**
- Mỗi máy một tài khoản Windows riêng của người đó; không cài cầu nối lên máy dùng chung
- Nhắc rõ: khóa nằm trên 5-6 máy → người rời team thì **phải xoay khóa**, không chỉ xóa tài khoản
- Bản sao lưu và khóa cất hai nơi khác nhau

## Next Steps

Xong đợt này → mở đợt TikTok: mô hình content video, kho file R2, ngưỡng luật riêng theo nền tảng.
Xem [báo cáo tra cứu TikTok](../reports/research-260804-1717-tiktok-content-posting-api.md).
