# Lộ trình phát triển

**Cập nhật:** 05/08/2026

Đây là **nguồn duy nhất về trạng thái** của dự án. Bản thiết kế chi tiết từng giai đoạn ở
[plans/](../plans/260801-2030-multi-account-posting-console/plan.md); vì sao làm ở
[project-overview-pdr.md](project-overview-pdr.md).

Dự án đang chạy **hai luồng song song**:

| Luồng | Là gì | Trạng thái |
|---|---|---|
| **A — Công cụ** | 5 giai đoạn gốc: kho danh tính → hàng đợi → sức khỏe → Facebook → tự đăng Reddit | GĐ1-4 xong, GĐ0 kẹt ở tiền + cold-start, GĐ5 chưa bắt đầu |
| **B — Web chung** | Biến app một máy thành web chung cho 5-6 người ở 5-6 nơi | GĐ0-2 xong 05/08, GĐ3 đang làm (7/11 việc), còn 3 giai đoạn |

Luồng B sinh ra sau khi chốt bàn giao cho team — xem
[plan web chung](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md). Nó **không thay thế**
luồng A: tự đăng Reddit vẫn nằm ở luồng A và vẫn chờ nick thật.

---

## Luồng A — Trạng thái các giai đoạn

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

## Luồng B — Web chung cho team phân tán

Chi tiết ở [plan.md](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md). Tổng ~3-3.5 tuần.

| # | Giai đoạn | Trạng thái | Ngày | Còn thiếu gì |
|---|---|---|---|---|
| 0 | Spike: trình duyệt gọi xuống cầu nối | ✅ Xong | 04/08 | – (chốt 3 ràng buộc bắt buộc cho GĐ2/3/4) |
| 1 | [Postgres + múi giờ team](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-01-postgres-va-mui-gio-team.md) | ✅ Xong hẳn | 05/08 | – (chốt bắt đầu từ kho rỗng, không nhập lại dữ liệu thử) |
| 2 | [Đăng nhập, vai trò, chủ sở hữu nick](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-02-dang-nhap-vai-tro-chu-so-huu.md) | ✅ Xong | 05/08 | – (hoãn có chủ ý: bộ lọc "nick của tôi", chỉ là tiện nghi hiển thị) |
| 3 | [Tách hai vùng khóa + vé ký](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-03-tach-hai-vung-khoa-va-ve-ky.md) | 🟡 Đang làm — 7/11 việc | Bắt đầu 05/08 | Bộ dựng/ký/mã hóa vé, chuyển reveal/OTP sang vé, gỡ khóa vùng operator khỏi máy chủ |
| 4 | Cầu nối trên máy operator | ⬜ Chưa bắt đầu | – | **Đường găng.** Chờ GĐ3 |
| 5 | Lên Railway + cron + sao lưu | ⬜ Chưa bắt đầu | – | Làm song song được từ sau GĐ1 |
| 6 | Bàn giao team | ⬜ Chưa bắt đầu | – | Chờ GĐ4 |

**GĐ1 đã đổi nền dữ liệu sang Postgres và đóng hẳn** (05/08/2026): 482/482 test, 4 smoke test và
`npm run db:backup` đều xanh trên Postgres. Ràng buộc 1 nick = 1 proxy vẫn do database ép.
Cố ý **không viết script chuyển dữ liệu**, và chốt 05/08/2026 là **không nhập lại gì cả**:
chưa có nick thật nào, 3 nick cũ đều là nick thử. Kho bắt đầu từ rỗng.

> Giữ lại `dev.db` cũ: 10 proxy Webshare trong đó là dữ liệu thật đã trả tiền và đã kiểm
> 10/10 ngày 04/08. Mật khẩu proxy không nằm ở đâu khác.

**GĐ2 đã đổi hàng rào và đóng** (05/08/2026): từ "app chỉ nghe ở `127.0.0.1`" sang "phải đăng
nhập Google và có tên trong `ALLOWED_EMAILS`". Cờ `-H` đã bỏ — đúng thứ tự đã hẹn, chỉ sau khi
danh sách lối vào chưa gác về rỗng. Nghiệm thu tay đã chạy thật, và chính nó bắt ra lỗ mà không
phép kiểm tĩnh nào thấy: **trang** không đi qua wrapper gác nào cả, phải thêm `src/proxy.ts`.

> Còn một lỗ **đã biết và cố ý chưa đóng**: một phiên đăng nhập bị trộm vẫn đọc được mật khẩu
> nick, vì khóa vẫn nằm cùng một chỗ với máy chủ. Đó là việc của GĐ3, và là lý do **chưa bàn
> giao cho ai** trước khi GĐ3 xong.

**GĐ3 đang chạy — 7/11 việc** (05/08/2026). Kho đã chia hai vùng khóa thật: `VAULT_KEY_SERVER`
(mật khẩu proxy, token Facebook) và `VAULT_KEY_OPERATOR` (mật khẩu, email, TOTP của nick). Vùng
của từng cột khai ngay trong `schema.prisma` bằng dấu `vault:server` / `vault:operator`, và test
đọc thẳng schema nên khai thiếu hoặc khai lệch là đỏ. `vault:rekey` nay xoay theo từng vùng;
`vault:smoke` đã xanh trên DB thật, gồm phép thử **khóa vùng server KHÔNG mở được mật khẩu nick**.

> Lỗ ở trên **vẫn chưa đóng**: máy chủ hiện vẫn giữ `VAULT_KEY_OPERATOR` vì bốn chỗ còn cần nó
> (tạo nick, sửa nick, xem mật khẩu, sinh OTP). Chỉ đóng được sau khi bốn chỗ đó chuyển sang phát
> vé. Grep `loadVaultKey("operator")` trong `src/` là danh sách chính xác phải dọn, và phép thử
> nghiệm thu cuối GĐ3 là **gỡ hẳn biến đó khỏi máy chủ mà app vẫn chạy đủ mọi chức năng**.

Từ đó tới nay thêm **cặp khóa ký vé Ed25519 của máy chủ**. Máy chủ không còn tự đưa mật khẩu cho
ai được nữa; thứ nó còn làm được là bảo chứng *"vé này do máy chủ phát sau khi đã kiểm phiên và
kiểm chủ nick"* — chữ ký là lời bảo chứng đó. Chỉ một biến môi trường (`TICKET_SIGNING_KEY`, hạt
giống khóa riêng), khóa công khai suy ra từ nó chứ không khai riêng, nên không có đường sinh ra
một cặp lệch. Hai lệnh: `keys:server-keygen` sinh cặp mới, `keys:server-pubkey` in lại khóa công
khai đang dùng — thứ cần tới mỗi lần cài cầu nối lên một máy mới.

Và **sổ đăng ký máy chạy cầu nối** (`/relay-devices`). Mỗi máy khai một khóa công khai X25519;
máy chủ bọc nội dung vé bằng khóa của đúng máy nhận, nên trình duyệt chuyển vé qua tay mà không
đọc được gì bên trong — kể cả mật khẩu proxy. ADMIN đăng ký và thu hồi, cả team đọc được sổ
(khóa công khai lộ cũng không mất gì, còn giấu đi thì không ai tự trả lời được *"máy tôi vào sổ
chưa?"*). Thu hồi là một chiều: khóa của máy đã mất coi như đã lộ.

> **Thu hồi không phải là xong.** Nó chặn **vé mới**, nhưng không với tới ciphertext chiếc máy đó
> đã lấy về từ trước — thứ đang nằm trên ổ cứng của chính chiếc laptop đã mất. Mất máy thì thu hồi
> xong vẫn phải xoay `VAULT_KEY_OPERATOR`. Câu thông báo sau khi bấm nút nói đúng ranh giới này,
> và có test canh nó.

Và **bộ phát/xác minh vé** — mảnh cuối của phần nền. Máy chủ bọc ruột vé cho riêng máy nhận (cặp
khóa dùng một lần cho mỗi tấm vé, X25519 → HKDF → AES-256-GCM), rồi ký Ed25519 phủ lên cả bao
ngoài lẫn ruột đã bọc. Cầu nối xác minh chữ ký **trước khi** giải mã bất cứ thứ gì. Vé sống 30
giây và tiêu được đúng một lần; sổ chống dùng lại nằm ở cầu nối, vì theo QĐ 5 nó không nối mạng
để hỏi máy chủ, và máy chủ cũng không biết — nó phát vé rồi thôi.

Vé mang **hai số phiên bản** ngay từ tấm đầu tiên (QĐ 11), và `verifyTicket` kiểm chúng ngay sau
chữ ký: cầu nối bản cũ phải nói được *"bản quá cũ, tải lại"* thay vì chết mơ hồ ở bước giải mã.

> Còn ba việc mới nối được vé vào nút bấm thật: chuyển `revealCredential` / `requestOtpCode` sang
> phát vé, vé mở profile kèm cấu hình proxy, và form tạo/sửa nick dựng ciphertext ở phía máy người
> dùng. Hôm nay module vé đã chạy và có test hai đầu, nhưng **chưa lối vào nào gọi nó**.

Ngoài 11 việc gốc, hai chốt nữa đóng trong ngày. **Ghi đè bí mật nick nay phải là chủ nick** —
đối xứng với `revealCredential`; trước đó một OPERATOR không đọc được mật khẩu nick của đồng
nghiệp nhưng ghi đè được nó. Chỉ gác khi form thật sự mang bí mật lên, nên sửa karma / trạng thái
/ proxy cho nhau vẫn là việc chung. Việc `status` bị kéo từ `SHADOWBANNED` về `HEALTHY` **không**
giải bằng phân quyền (chủ nick cũng ép được) mà bằng dấu vết: nhật ký nay ghi cả chiều đổi.

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
