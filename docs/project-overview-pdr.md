# MKTTool — Tài liệu sản phẩm

**Cập nhật:** 10/08/2026 · **Trạng thái:** [development-roadmap.md](development-roadmap.md)

Tài liệu này trả lời "vì sao" và "phạm vi tới đâu". Chi tiết thi công nằm ở
[plan công cụ gốc](../plans/260801-2030-multi-account-posting-console/plan.md),
[plan Web chung](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md) và
[plan MKT Browser](../plans/260810-0244-mkt-browser-noi-bo/plan.md).
Thuật ngữ tra ở [domain-glossary.md](domain-glossary.md); mục lục tài liệu ở [docs/README.md](README.md).

---

## 1. Vấn đề

Team marketing muốn tăng nhận diện thương hiệu và kiếm lead trên Reddit và Facebook bằng cách
vận hành nhiều tài khoản. Vận hành nhiều nick có đúng **hai cách chết**:

| Cách chết | Nguyên nhân | Phần nào lo |
|---|---|---|
| **Bị nhận ra là cùng một người** | Nhiều nick dùng chung IP, chung vân tay trình duyệt, chung thói quen | Kho danh tính (Phase 01) + antidetect browser |
| **Bị nhận ra là đang spam** | Đăng nội dung na ná giữa các nick, đăng dồn dập, toàn quảng cáo, nhiều nick đụng cùng một bài | Bộ luật an toàn (Phase 02) |

Nguyên nhân shadowban số 1 là cách thứ hai, không phải cách thứ nhất. Vì vậy phần lớn giá trị của
công cụ nằm ở bộ luật, không nằm ở kỹ thuật giả vân tay.

## 2. Ai dùng

| Vai | Số người | Làm gì |
|---|---|---|
| MKT specialist | **1** | Vận hành toàn bộ: nhập nick, xếp lịch, đăng, theo dõi sức khỏe |
| Người viết content | 3 | Viết bài ở pipeline riêng, đưa sang công cụ |

Giai đoạn 1 công cụ chạy trên **máy bàn của bạn MKT**, nghe localhost, không đăng nhập. Từ
05/08/2026 nó thành web chung cho team: đăng nhập Google, danh sách trắng email, hai vai trò
(ADMIN / OPERATOR) và nick có người phụ trách.

## 3. Quy mô giai đoạn 1

- 5-8 nick Reddit *(nền tảng chính, ~80% công sức)*
- 1-3 Fanpage Facebook *(qua Graph API chính thức)*
- 2-3 nick Facebook cá nhân *(để quản trị Page và seeding group thủ công)*
- Mục tiêu vận hành: **15-20 bài/ngày trong khoảng 1 tiếng**

## 4. Phạm vi KHÔNG làm

Đây là phần quan trọng nhất của tài liệu. Những ranh giới dưới đây giữ dự án không trượt thành
spam farm — thứ vừa vô đạo đức vừa chết nhanh.

| Không làm | Vì sao |
|---|---|
| **Auto-DM / nhắn tin hàng loạt** | Là spam theo mọi định nghĩa, và là đường ngắn nhất tới khóa vĩnh viễn |
| **Reply hijacking** — nhảy vào thread người khác để quảng cáo | Phá hoại cộng đồng, mod ghét nhất |
| **AI sinh nội dung** | Team tự viết. Nội dung AI hàng loạt là thứ Reddit đang săn |
| **Tự giải captcha** | Gặp captcha nghĩa là nick ĐÃ bị nghi ngờ. Tự giải để chui vào tiếp biến cảnh báo mềm thành khóa vĩnh viễn |
| **Tự động đăng Facebook Group** | Groups API bị Meta khai tử 04/2024. Không tool nào làm được nữa. Group đăng tay |
| **Bot chạy 24/7 không người giám sát** | Phase 05 là "bán tự động": máy soạn sẵn, người bấm nút cuối |
| **Dùng chung proxy giữa các nick** | Ràng buộc 1:1 do database ép, không lách được |
| **Đưa nick thật lên proxy datacenter giá rẻ** | Proxy rẻ để test kỹ thuật thì được, đưa nick thật vào là giết nick |

Nếu sau này có ai đề xuất thêm một trong các mục trên, đây là nơi ghi lý do đã từ chối.

## 5. Quyết định cốt lõi

1. **Console trước, tự động sau.** Giá trị nằm ở quản lý danh tính + bộ luật (90% lợi ích,
   20% công sức, gần như 0 rủi ro), không nằm ở bot chạy 24/7.
2. **Chạy trên desktop, chưa cần VPS.** Antidetect browser là app desktop → bỏ được
   Docker/Xvfb/VPS ở giai đoạn 1.
3. **Reddit bắt buộc dùng browser.** API miễn phí cấm mục đích thương mại; API thương mại ~$12k/tháng.
4. **Facebook Pages dùng Graph API chính thức.** Miễn phí, hợp lệ, không bao giờ bị khóa vì
   vi phạm chính sách tự động hóa.
5. ~~**SQLite + Prisma**, không Postgres/Redis. Một người dùng, một máy.~~
   **Đổi 04/08/2026: Postgres + Prisma.** Quyết định gốc đúng với giả định "một người dùng,
   một máy"; giả định đó hết hiệu lực khi chốt bàn giao cho 5-6 người ở 5-6 nơi. Vẫn không Redis.
6. **Control account browsers through local MCP, not Playwright.** MultiZen proved the behavior on
   02/08/2026; W01 preserved it as a rollback checkpoint, and W02 moved active first-party package,
   preload, MCP, adapter, and configuration identities to the owned **MKT Browser** contract on
   configurable default port `47822`. Profiles/cookies stay off the server, and v1 does not fork
   Chromium — see
   [kế hoạch MKT Browser](../plans/260810-0244-mkt-browser-noi-bo/plan.md).
7. **Nhưng bộ dò shadowban thì dùng Playwright trực tiếp** (Phase 03) — hai việc trái ngược
   nhau nên đi hai đường. Đăng bài cần *giả làm người có danh tính*; dò shadowban cần *đúng là
   một người lạ vô danh*: chưa đăng nhập, IP khác hẳn, không vân tay nào của nick. Mở nó bằng
   chính profile antidetect của nick là tự nhìn mình trong gương rồi kết luận người ngoài cũng
   thấy vậy.
8. **MKT Browser không thay Cầu nối.** Có thể phát chung một bộ cài, nhưng Cầu nối tiếp tục giữ
   khóa operator, xác minh vé và chống dùng lại; ứng dụng Electron chỉ giữ/chạy profile.
9. **macOS là nền tảng chính của MKT Browser.** Apple Silicon phải chạy native, có DMG ký/notarize,
   Cầu nối dùng helper + Keychain + LaunchAgent và nhân viên không phải mở Terminal. Windows x64
   vẫn được regression/hỗ trợ. V1 giữ UX/UI MultiZen; redesign để sau khi có phản hồi dùng thật.
10. **English is the only language for project artifacts from 10 August 2026 onward.** This
    includes code comments, UI and error copy, documentation, plans, tests, installers, release
    notes, and commit messages. Direct conversation with the project owner may remain Vietnamese.

## 6. Nguyên tắc bất di bất dịch

> **Mỗi nick Reddit có đúng 1 proxy tĩnh, 1 vân tay/profile, 1 máy giữ và 1 người phụ trách.**

Database ép hai nick không thể dùng chung proxy/profile (`Account.proxyId` và
`Account.antidetectProfileId` đều `@unique`). Quan hệ chủ nick/máy giữ được kiểm lại ở các action
và trước lúc phát vé; một người hoặc một máy vẫn có thể phụ trách nhiều nick.

## 7. Tiêu chí thành công

| Tiêu chí | Đo bằng |
|---|---|
| 6/8 nick Reddit sống, không shadowban sau 8 tuần | Bộ dò shadowban (Phase 03) |
| Đăng 15-20 bài/ngày trong ~1 tiếng | Bấm giờ thực tế |
| **0 lần đăng trùng nội dung giữa 2 nick cùng nền tảng** | Luật 7 chặn được, đếm số lần chặn |
| Quy được lead thật về từng nick | Số liệu Phase 03 |

## 8. Ràng buộc

**Ngân sách**

| Khoản | Một lần | Hàng tháng |
|---|---|---|
| Nick Reddit cổ (8) | 2-5 triệu | – |
| Nick Facebook (3) | 1-3 triệu | – |
| Proxy tĩnh (11 IP) | – | ~700k |
| MKT Browser + engine ngoài | Chưa chốt — Apple Developer + chứng thư ký Windows | Chưa chốt — engine mới nhất có thể cần subscription |
| Thay nick hao hụt | – | ~500k-1tr |
| **Tổng** | **3-8 triệu + chi phí fork/ký chưa chốt** | **~1,2-1,7 triệu + engine nếu có** |

**Thời gian — không rút ngắn được**

Nick mua về phải **cold-start 14 ngày** (chỉ đọc, cấm đăng) trước khi dùng thật. Đây là đồng hồ
thực, không có cách nào đi tắt. Phần mềm xong sớm không giúp gì cho khoản chờ này.

## 9. Rủi ro lớn nhất

1. **Nguồn nick kém** — nick mua về chết trong 2 tuần đầu. Giảm thiểu: mua thử 2 nick trước,
   sống mới mua tiếp.
2. **Content không đủ nuôi** — 3 người không viết nổi cho nhiều nick. Đã hạ quy mô xuống 5-8.
3. **Mod Reddit là người thật** — không có giải pháp kỹ thuật nào. Phụ thuộc hoàn toàn vào
   chất lượng nội dung và tỷ lệ đóng góp hữu ích.
4. **Luật quá chặt → người dùng ghi đè liên tục → bộ luật thành vô dụng.** Giảm thiểu: ngưỡng
   để trong bảng `RuleConfig` chỉnh được; theo dõi số lần ghi đè, cao thì nới.

## 10. Lộ trình

| # | Giai đoạn | Trạng thái |
|---|---|---|
| 0 | Chuẩn bị & kiểm chứng khả thi | 🔄 Chặng B + C đạt 02/08/2026; còn mua proxy/nick + cold-start |
| 0B | Internal MKT Browser | 🟡 Windows W01/W02 verified; Mac-first MKB-00/MKB-01 gates remain open; retain upstream UX/UI in v1 |
| 1 | Kho danh tính | ✅ 01/08/2026 |
| 2 | Hàng đợi content + bộ luật an toàn | ✅ 02/08/2026 |
| 3 | Theo dõi sức khỏe tài khoản | ✅ 03/08/2026 — bộ dò đọc được Reddit thật. Proxy quan sát viên đã có và kiểm sống trên máy chủ (06/08/2026); **vẫn chưa chạy với nick thật** vì kho trên máy chủ chưa có nick Reddit |
| 4 | Facebook Pages publisher *(độc lập, làm lúc nào cũng được)* | ✅ 03/08/2026 — đã đăng thật lên Fanpage qua Graph API |
| 5 | Bán tự động đăng Reddit | ⬜ |

> **Chưa có bộ đặt lịch tự động, và đó là chủ ý.** "Xếp lịch" = ghi giờ dự kiến + chấm luật;
> đến giờ bài **không** tự lên. Fanpage phải bấm "Đăng lên Page", Reddit và Group đăng tay.
> Phase 05 cũng sẽ là "bán tự động": máy soạn sẵn, người bấm nút cuối — xem mục 4.

## Câu hỏi chưa có lời giải

- Ngưỡng luật hiện lấy theo kinh nghiệm chung, chưa có số liệu thật của chính đàn nick này.
  Phase 03 đã xong nên đã có chỗ để đo, và proxy quan sát viên đã sẵn sàng từ 06/08/2026 — nhưng
  chưa có nick thật để dò nên vẫn chưa có số liệu để quyết siết hay nới.
- Chưa chốt 2-3 subreddit mục tiêu và luật cụ thể của từng sub (việc của Phase 00 bước 1).
- Chưa đo được "xếp 15 bài trong 15 phút" vì chưa có người dùng thật chạy quy trình đầy đủ.
- ~~Mục 2 ghi rõ công cụ phục vụ **1 người**.~~ Web chung, đăng nhập, phân quyền, hai vùng khóa và
  Cầu nối đã hoàn tất; phần desktop riêng cho team nay đi theo
  [plan MKT Browser](../plans/260810-0244-mkt-browser-noi-bo/plan.md).
