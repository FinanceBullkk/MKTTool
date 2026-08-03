# Nhật ký thay đổi

Ghi theo ngày, gom theo giai đoạn. Chỉ ghi thứ đổi hành vi của công cụ — không ghi việc dọn dẹp
nội bộ. Trạng thái hiện tại ở [development-roadmap.md](development-roadmap.md).

Dự án chưa phát hành phiên bản (`0.1.0`, dùng nội bộ). Mốc chia theo giai đoạn, không theo semver.

---

## 04/08/2026 — Đưa bộ dò shadowban vào chạy thật

Đo trạng thái kho: **0 proxy quan sát viên, 0 lượt dò đã chạy**. Cả Phase 03 — parser
`old.reddit.com`, khóa chống chạy chồng, biểu đồ karma, luật số 10 — chưa từng chạy một lần nào
vì thiếu đúng một thứ, và không có màn hình nào nói ra điều đó.

**Tính năng**

- **Kiểm được proxy quan sát viên**, bằng đúng bộ kiểm của proxy thường. Ở bảng này kết quả
  quan trọng hơn: proxy của nick chết là mất một nick, proxy quan sát viên chết là **mù cả đàn**
  — mọi kết luận shadowban đều nhìn qua đúng một IP đó. Nếu nó rơi vào nhánh *Không đổi IP* thì
  bộ dò đang nhìn Reddit bằng chính IP nhà: kết luận trông vẫn hợp lý mà thật ra vô nghĩa.
- **Nút "Dò cả đàn" ngay trong app.** Trước đây `api/health/run` cố ý chỉ nhận một nick vì lượt
  đầy đủ mất gần mười phút, dài hơn mọi giới hạn chờ của một request. Giờ nút sinh **đúng tiến
  trình mà `npm run health` vẫn chạy** ở chế độ tách rời rồi trả lời ngay — không có bản sao thứ
  hai của luồng dò, đóng tab hay nạp lại dev server đều không ảnh hưởng. Trạng thái lượt đang
  chạy đọc từ chính file khóa vốn đã được thiết kế cho tình huống hai tiến trình.
- **Dải cảnh báo nói đúng nguyên nhân.** Câu cũ — *"N nick chưa được dò gần đây"* — đúng về hiện
  tượng nhưng sai về nguyên nhân: sự thật là *chưa từng chạy và không thể chạy*. Giờ tách ba
  tình huống, mỗi cái một câu và **một việc phải làm tiếp**: chưa có proxy quan sát viên → về
  `/proxies`; có rồi mà chưa dò → về `/health` bấm nút; đã dò nhưng lâu rồi → giữ câu cũ.

**Vì sao đáng sửa câu chữ:** dải cảnh báo cũ sẽ hiện **vĩnh viễn**, không tự tắt được dù người
dùng làm gì trên màn hình đó. Dải nào không bao giờ tắt thì trong một tuần sẽ được học cách phớt
lờ — và tới lúc nó nói chuyện thật thì cũng không ai còn nhìn.

**Dọn nội bộ:** tách phần **đo** khỏi phần **ghi** trong bộ kiểm proxy, vì giờ có hai bảng
(`Proxy` và `ObserverProxy`) dùng chung một phép đo. Ô "lần kiểm gần nhất" cũng gom về một
component dùng chung cho cả hai bảng.

**Kiểm chứng:** `typecheck` + `lint` + `382 test`; chạy đúng dòng lệnh launcher sinh ra → báo
đúng "chưa có proxy quan sát viên" và thoát mã 1; hồi quy kiểm một proxy thật sau khi tách hàm.
Xem [plan](../plans/260804-0353-dua-bo-do-shadowban-vao-chay-that/plan.md).

**Nghiệm thu bằng thực tế cùng ngày:** khai một proxy quan sát viên IPRoyal ISP dedicated (US) →
kiểm → **Dò cả đàn**. Hai bản ghi `HealthCheck` đầu tiên của dự án. Không nick nào ra "Không dò
được", tức IPRoyal đọc được `old.reddit.com` bình thường.

**Hai lỗi lộ ra ngay ở lượt dò thật đầu tiên** — cả hai đều thuộc kiểu *đếm sai rồi kết luận
chắc nịch*, và 390 test không bắt được cái nào vì chúng chỉ hiện ra khi gặp dữ liệu thật:

- **404 bị khẳng định là "shadowban toàn cục"** trong khi Reddit trả về cùng một trang cho bốn
  nguyên nhân — kể cả **username khai sai trong kho**. Nó đã tự cách ly nhầm một nick đang khỏe.
  Sửa: câu chữ nói đúng thứ đo được, và dùng lịch sử dò làm bằng chứng — *đã từng đọc được*
  profile này rồi mà giờ mất thì mới loại trừ được khả năng gõ sai và mới nói chắc.
  Hành động **không đổi**: vẫn cách ly ở cả hai nhánh. Cách ly nhầm một nick khỏe thì ồn ào và
  sửa được bằng tay; để một nick đã bị ẩn đăng tiếp thì im lặng và tốn content mỗi ngày.
- **Mẫu số đếm số job thay vì số bài khác nhau.** Một nick có hai job `POSTED` dán trùng đúng
  một link → bảng hiện "1/2" trong khi ngoài đời là 1/1. Vừa đúng sát ngưỡng cảnh báo (thấy dưới
  một nửa); thêm một job trùng nữa là nick sạch bị báo **Nghi ngờ**. Sửa: đếm URL khác nhau sau
  khi chuẩn hóa, dùng lại đúng `normalizeThreadUrl()` của luật 8 thay vì tự rút gọn kiểu riêng.

Đo lại sau khi sửa: mẫu số của nick đó về **1**, đúng với thực tế.

---

## 04/08/2026 — Công cụ tự phát hiện hỏng hóc

**Tính năng**

- **Kiểm proxy còn sống, ngay trong công cụ.** Nút "Kiểm" từng dòng và "Kiểm tất cả" ở `/proxies`;
  mỗi lượt đi qua đúng proxy đó hỏi dịch vụ tra cứu xem người ngoài nhìn thấy IP nào. Trước đợt
  này việc đó hoàn toàn nằm ngoài công cụ — `launch/route.ts` chỉ in ra câu "vẫn nên mở ipinfo.io
  kiểm tra IP" rồi để người dùng tự làm, nên proxy chết chỉ lộ ra trên giao diện antidetect.
- **Năm kết luận, và "không đo được" không nằm chung với "khỏe":** Sống · Chết · **Không đổi IP** ·
  Lệch nước · Không kiểm được. Nhánh *Không đổi IP* là nhánh đáng tiền nhất — proxy trả lời bình
  thường nhưng lưu lượng vẫn ra bằng IP nhà, đúng kiểu hỏng mà `launch/route.ts` sợ nhất và trước
  đây không ai phát hiện được.
- **Lớp chặn thứ tư trước khi mở profile.** Proxy kết luận *Chết* hoặc *Không đổi IP* thì **không
  mở**, ghi `PROFILE_LAUNCH_BLOCKED_PROXY` vào `AuditLog`. Lệch nước và không kiểm được thì vẫn mở
  nhưng nói rõ — chặn ở hai nhánh đó là biến công cụ thành thứ không mở nổi profile mỗi khi mạng
  chập chờn.
- **Trang Hôm nay hiện proxy hỏng và token Facebook hỏng.** Hai dải cảnh báo mới, đọc thẳng từ
  database nên không thêm lời gọi mạng nào vào trang mở nhiều nhất. Token dùng lại
  `evaluateTokenHealth()` của luồng đăng bài — hai nơi tự đánh giá "token còn dùng được không" là
  hai nơi chắc chắn sẽ lệch.

**Không thêm dependency:** `undici.ProxyAgent` không resolve được trong dự án, nên phần đi qua
proxy tự viết trên `node:net` — proxy HTTP dùng request dạng tuyệt đối, proxy SOCKS5 bắt tay tay
theo RFC 1928/1929. Xin `HTTP/1.0` để phần thân không bao giờ bị chia khối.

**Sửa theo đo thật:** lượt đo đầu trên 10 proxy Webshare, ipinfo.io trả 429 cho hai IP và 403 cho
một IP, lặp lại y hệt ở lượt sau — tức chặn theo IP chứ không phải giới hạn tần suất. Một nhà cung
cấp duy nhất nghĩa là 3/10 proxy vĩnh viễn "không kiểm được", nên thêm chuỗi dự phòng
(`ipinfo.io` → `ip-api.com` → `icanhazip.com`). Sau khi thêm: **10/10**.

**Kiểm chứng:** `typecheck` + `lint` + `375 test` xanh; đo thật 10 proxy Webshare (10/10 đúng IP
và đúng quốc gia); nhánh SOCKS5 đối chiếu với nhánh HTTP trên cùng một proxy, hai đường ra cùng
một IP. Xem [plan](../plans/260804-0321-cong-cu-tu-phat-hien-hong-hoc/plan.md).

**Đã cân nhắc và quyết định KHÔNG làm:** hẹn giờ đăng Fanpage bằng `scheduled_publish_time`.
Giao bài cho Facebook giữ là bộ luật mất quyền chặn trong khoảng từ lúc hẹn tới lúc lên — nặng
nhất là job bị chấm lại thành **BỊ CHẶN** trong khi Facebook vẫn đăng đúng giờ, tức giao diện
nói một đằng thực tế một nẻo. Fanpage tiếp tục bấm tay đúng giờ. Lý do đầy đủ giữ ở
[phase-03](../plans/260804-0321-cong-cu-tu-phat-hien-hong-hoc/phase-03-hen-gio-dang-fanpage-bang-facebook.md)
để lần sau không phải cân nhắc lại từ đầu.

---

## 03/08/2026 — Băng chuyền vòng đăng bài

**Tính năng**

- **Băng chuyền ở trang xếp lịch** — `Content → Nick → Đích → Giờ → 10 luật`, mỗi chặng đổi màu
  theo trạng thái thật, bấm chặng nào thì con trỏ nhảy vào ô nhập đó. Đèn chặng cuối lấy thẳng
  từ verdict nên không thể lệch với bảng luật bên dưới.
- **Băng chuyền vòng đăng bài ở trang Hôm nay** — `Chờ đăng → Quá giờ → Đã đăng hôm nay →
  Tương tác 30 ngày`. Chặng **Quá giờ** là thứ chưa từng hiện ở đâu: job tới giờ mà vẫn `PENDING`
  nghĩa là hoặc chưa đăng, hoặc đã đăng mà quên bấm "Đã đăng" — vế sau làm bộ luật coi như bài
  đó chưa từng tồn tại.
- **Sơ đồ vòng đời một bài đăng** trong [system-architecture.md](system-architecture.md) — ba
  đường ngược từ `Interaction`/`ContentItem` về bộ luật vẽ rõ vì sao quên một nút lại làm cả bộ
  luật dại đi.

**Chưa làm, có chủ ý:** không biến đèn luật thành đồng hồ đo (hiện "7/9 bài hữu ích" thay cho
dấu ✓), vì việc đó phải sửa cả 10 file luật để giữ `reason` khi verdict là ALLOW. Đợi băng chuyền
được dùng thật đã rồi mới đụng vào lõi. Không dựng canvas kéo-thả — form bốn ô nhanh hơn kéo dây
cho việc đăng từng bài. Xem [plan](../plans/260803-2257-bang-chuyen-vong-dang-bai/plan.md).

---

## 03/08/2026 — Rút gọn luồng người dùng: mỗi bài từ 4 trang xuống 2

**Tính năng**

- **Nav 9 mục gom còn 4, chia theo tần suất dùng.** `Hôm nay · Hàng đợi · Sức khỏe` nằm ngang,
  sáu trang kho (Nick, Nhân vật, Proxy, Đích đăng, Content, Facebook) vào dropdown "Kho" — mở
  được bằng bàn phím, đóng bằng Escape hoặc bấm ra ngoài. Không route nào bị xóa hay đổi tên.
- **Bấm "Đã đăng" kèm link ngay ở thẻ nhắc việc trang Hôm nay**, không phải sang hàng đợi. Cùng
  một component với hàng đợi (`mark-posted-control.tsx`) nên hai đường ghi không thể lệch nhau.
- **Viết content mới thẳng ở trang xếp lịch** — tab `Viết mới | Chọn từ kho`. Đèn luật chạy
  realtime cho cả hai tab (bộ luật đã hỗ trợ nhánh nháp sẵn, chặn nằm ở hai schema tầng trên).
  Kho content trống không còn chặn trang xếp lịch.

**Ràng buộc giữ nguyên:** nháp được LƯU thành `ContentItem` khi bấm xếp lịch — chấm luật trước,
lưu sau, để bài không tự so trùng với chính nó. Job không bao giờ trỏ vào content ảo, nên luật 7
(trùng nội dung 30 ngày) vẫn đủ dữ liệu để so.

**Kiểm chứng:** `typecheck` + `lint` + `358 test` + `rules:smoke` (6/6) + `next build` đều xanh.
Thêm `post-job-actions.database.test.ts` khóa đúng ràng buộc trên.

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
