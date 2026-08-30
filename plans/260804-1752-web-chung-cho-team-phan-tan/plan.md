# Web chung cho team phân tán

Đưa MKTTool từ "app chạy trên một máy" thành **web chung cho 5-6 người ở 5-6 nơi**, mà không
hạ thấp mức bảo vệ kho danh tính.

**Ngày lập:** 2026-08-04 | **Branch:** master

> File này là bản kế hoạch: quyết định, phạm vi, phụ thuộc, rủi ro.
> Trạng thái làm tới đâu xem [docs/development-roadmap.md](../../docs/development-roadmap.md).

> **Historical specification — superseded for the 30 August 2026 release.** This 4 August design is
> retained for architecture history. The successor consolidation records the current boundary:
> P4a Web is deployed independently; the Browser five-artifact tuple is P4b **OPEN**; TikTok content,
> scheduling, warmup, and posting remain parked; Q15 is self-serve on the owner's machines with no
> notification channel; and Q16 confirms no CloakBrowser channel, so Lane C is **CLOSED**. Do not
> execute the old TikTok/MultiZen rollout steps without a new owner decision.

---

## Bối cảnh

| Hạng mục | Chốt |
|---|---|
| Người dùng hôm nay | **chỉ tác giả** — công cụ chưa bàn giao cho ai |
| Người dùng sau đợt này | 5-6 người, mỗi người một nơi, **low-tech** |
| Phân công | mỗi người một bộ nick **theo nền tảng** |
| Vận hành Reddit | **1-2 người** — tức chỉ 1-2 máy cần MultiZen + cầu nối ở đợt này |
| Nền tảng | Reddit + Facebook Pages hôm nay; **TikTok là feature quan trọng kế tiếp** |
| Video (cho TikTok) | đang tạm để trên **Google Drive** |
| Mục đích | nội bộ, không thu tiền |
| Máy | Windows |
| Múi giờ chuẩn | `Asia/Ho_Chi_Minh` |

**TikTok không có đường API.** Guidelines của TikTok nêu đích danh "công cụ upload cho nick mà
bạn hoặc team bạn quản lý" là use case **không được chấp nhận** — xem
[báo cáo tra cứu](../reports/research-260804-1717-tiktok-content-posting-api.md). Nên TikTok cùng
dạng Reddit: MultiZen + đăng tay. Đây là lý do **mọi người đều cần MultiZen**, và là lý do kiến
trúc dưới đây tồn tại.

## Mười hai quyết định đã chốt

| # | Quyết định | Chốt |
|---|---|---|
| 1 | `VAULT_KEY` ở đâu | **Hai vùng khóa.** Máy chủ giữ khóa proxy + token Facebook. Bí mật nick (mật khẩu, email, TOTP) chỉ giải mã được ở máy operator |
| 2 | Khóa vùng operator | **Một khóa chung** cho cả team. Ngăn cách "ai xem nick nào" do máy chủ gác |
| 3 | Trình duyệt ↔ cầu nối | **Chia theo việc:** mở profile gọi ngầm xuống `127.0.0.1`; bí mật đi qua tab nhỏ do cầu nối phục vụ. **GĐ0 đã đo: giữ nguyên, kèm 3 ràng buộc bắt buộc** (xem dưới) |
| 4 | Danh tính | Đăng nhập **Google** + danh sách email cho phép. Hai vai trò. Mọi thứ ai cũng xem, **trừ** bí mật nick |
| 5 | Cầu nối nối mạng? | **Không.** Máy chủ phát **vé ký + mã hóa cho riêng cầu nối nhận, hết hạn ~30s**, trình duyệt chỉ là người đưa thư. Mỗi cầu nối một cặp khóa, thu hồi được từng cái |
| 6 | Cầu nối viết bằng gì | **TypeScript → một file `.exe`**, dùng lại 929 dòng đã có test. **GĐ0 đã đo bằng Node SEA: chạy được, 87 MB** |
| 7 | File video (TikTok) | **Kho file riêng** (R2). Chốt hướng nay, xây khi làm TikTok |
| 8 | Cách bàn giao | **Làm hết rồi bàn giao một lần.** Không có giai đoạn quá độ |
| 9 | Stack | **Dockerfile** (di động giữa các hãng) chạy trên Railway + Postgres Railway + Better Auth + ~~Bun~~ đóng gói cầu nối. **Đã đi khác: Node SEA, không phải bun** — lý do ở [GĐ4](phase-04-cau-noi-tren-may-operator.md) |
| 10 | Quyền mạng nội bộ ở GĐ6 | **Không đặt policy Chrome.** Người cài bấm "Cho phép" hộ ngay trong buổi cài máy — [chi tiết](#qđ-10--không-đặt-policy-chrome-người-cài-bấm-cho-phép-hộ-ngay-trong-buổi-cài-máy) |
| 11 | Phát hành cầu nối | **Không tự cập nhật** (đục thủng tính chất ngoại tuyến của QĐ 5). Tải từ web app sau đăng nhập, app tự báo bản cũ — [chi tiết](#qđ-11--cầu-nối-không-tự-cập-nhật-tải-từ-chính-web-app-và-app-tự-báo-khi-bản-cũ) |
| 12 | Gói cầu nối nằm ở đâu | **Ngăn riêng trên R2, app lấy hộ và stream về sau lớp đăng nhập.** Chưa làm ngay — có mốc kích hoạt — [chi tiết](#qđ-12--gói-cầu-nối-cất-trên-r2-app-lấy-hộ-chưa-làm-ngay) |

> **Nguyên tắc chọn:** khi có nhiều đường, lấy đường bền hơn kể cả khi tốn code hơn. Ba chỗ đã
> sửa theo nguyên tắc này sau khi rà lại (04/08/2026): mã hóa nội dung vé cho cầu nối (QĐ 5),
> khóa chống chạy chồng chuyển vào database thay khóa file (GĐ5), và Dockerfile thay cấu hình
> riêng của Railway (QĐ 9).
>
> Chỗ thứ hai đã làm 05/08/2026, và **đi khác bản chốt ban đầu**: chốt cũ ghi "advisory lock
> Postgres", làm thật thì hóa ra advisory lock **hỏng mở** — nó gắn theo session, mà giữ một
> connection riêng suốt mười phút trên Railway thì lớp proxy cắt lúc nào không biết, và
> connection chết là Postgres tự nhả khóa cho lượt thứ hai chen vào. Nó cũng không mang được dữ
> liệu "ai đang giữ", nên vẫn phải kèm một hàng — hai cơ chế cho một khái niệm. Thay bằng
> **một hàng trong bảng `HealthCheckLock`**: hỏng đóng, và trạng thái là thứ đọc được bằng một
> truy vấn thường.

## Kiến trúc

```
┌─ Railway ──────────────────────────┐        ┌─ Máy operator (Windows) ────────┐
│  Next.js  ── Postgres              │        │                                 │
│  · hàng đợi, bộ luật, sức khỏe     │  vé    │  Cầu nối .exe (127.0.0.1)       │
│  · Graph API Fanpage               │ ─────► │   · xác minh chữ ký             │
│  · cron dò shadowban               │ (qua   │   · giải mã bằng khóa operator  │
│  · giữ khóa vùng MÁY CHỦ           │  trình │   · gọi MultiZen MCP :7777      │
│    (proxy, token FB)               │  duyệt)│   · giữ khóa vùng OPERATOR      │
└────────────────────────────────────┘        └─────────────────────────────────┘
```

Cầu nối **không có kết nối ra ngoài** — chỉ nói chuyện với MultiZen trên cùng máy.
Chiếm được máy chủ không mở được một mật khẩu nick nào.

## Kết quả GĐ0 (đo 04/08/2026) — ba ràng buộc bắt buộc cho GĐ2/3/4

Spike đã chạy thật trên Chrome 150.0.7871.188 và Edge 151.0.4129.59 —
[báo cáo đầy đủ](../reports/spike-260804-1835-trinh-duyet-goi-cau-noi.md).

**Cả hai câu đều CÓ**, nhưng đường gọi ngầm có một điều kiện không có trong kế hoạch gốc:
**Local Network Access** (luật mới thay Private Network Access) bật sẵn ở cả hai trình duyệt.
CORS và preflight **không** phải rào cản — máy chủ trả header khéo tới đâu cũng không tự mở
được đường, vì luật đời mới hỏi **người dùng** chứ không hỏi máy chủ.

**Quyền chỉ phải cấp một lần cho mỗi máy.** Đo tiếp cùng ngày: cấp xong, đóng Chrome, mở lại —
quyền vẫn `granted` và lời gọi bắn **tự động** lúc trang nạp ra HTTP 200, không cần cú bấm nào nữa.

| Ràng buộc | Vì sao |
|---|---|
| 1. Lời gọi ngầm **đầu tiên trên mỗi máy** phải nằm **trong trình xử lý cú bấm** | Bắn lúc trang nạp thì Chrome nuốt luôn cả hộp xin quyền lẫn request. Không gọi trong `useEffect`, không đẩy qua một vòng `await` trước — đợi xong là mất kích hoạt người dùng. **Cấp quyền xong thì hết hiệu lực** |
| 2. **Tự đặt hạn giờ** cho mọi lời gọi | Bị chặn thì fetch **treo, không ném lỗi, console trắng trơn**. Không tự đặt hạn giờ là giao diện đứng im vĩnh viễn và không log lại được gì. **Không bao giờ gỡ** — người dùng bấm Chặn hoặc xóa quyền là quay lại cảnh này |
| 3. Ô "cầu nối đang sống" cập nhật ngầm **được, sau khi máy đó đã cấp quyền** | Máy chưa cấp thì lời gọi nền treo im lặng, không hiện hộp nào. Phải có ô thứ ba *"chưa cấp quyền"*, đừng gộp vào *"mất kết nối"* |

**GĐ6 đã chốt 05/08/2026 — xem [QĐ 10](#qđ-10--không-đặt-policy-chrome-người-cài-bấm-cho-phép-hộ-ngay-trong-buổi-cài-máy):**
không đặt policy; người cài bấm "Cho phép" hộ trong buổi remote desktop vốn đã phải có.
Phương án policy `LocalNetworkAccessAllowedForUrls` (Chrome 139+, `HKLM\SOFTWARE\Policies\Google\Chrome\...`,
kiểm ở `chrome://policy`) giữ lại làm đường dự phòng cho đợt TikTok khi số máy nở ra.

Đường lùi vẫn nguyên: tab nhỏ do cầu nối phục vụ là **cùng nguồn với cầu nối** nên không
dính luật này. Chrome siết thêm thì chuyển thao tác sang tab nhỏ — mất mượt, không mất an toàn.

## Các giai đoạn

| # | Giai đoạn | Trạng thái | Dự kiến | File |
|---|---|---|---|---|
| 0 | Spike: trình duyệt gọi xuống cầu nối | ✅ xong 04/08 | 0.5 ngày | [phase-00](phase-00-spike-trinh-duyet-goi-cau-noi.md) |
| 1 | Postgres + múi giờ team | ✅ xong 04/08 | 2-3 ngày | [phase-01](phase-01-postgres-va-mui-gio-team.md) |
| 2 | Đăng nhập, vai trò, chủ sở hữu nick | ✅ xong 05/08 | 3-4 ngày | [phase-02](phase-02-dang-nhap-vai-tro-chu-so-huu.md) |
| 3 | Tách hai vùng khóa + vé ký | ✅ xong 06/08 | 3-4 ngày | [phase-03](phase-03-tach-hai-vung-khoa-va-ve-ky.md) |
| 4 | Cầu nối | ✅ xong 06/08 | 4-6 ngày | [phase-04](phase-04-cau-noi-tren-may-operator.md) |
| 5 | Lên Railway + cron + sao lưu | 🟢 web chạy thật 06/08 | 2-3 ngày | [phase-05](phase-05-len-railway-cron-sao-luu.md) |
| 6 | Bàn giao team | ⬜ | 2-3 ngày | [phase-06](phase-06-ban-giao-team.md) |

**Tổng: ~3-3.5 tuần** (đã tính thêm phần nâng cấp ở ba chỗ nói trên).
Vẫn nằm trong mốc "team dùng sau 1-2 tháng".

## Phụ thuộc

```
GĐ0 (spike) ─── chặn đường GĐ4, ảnh hưởng giao diện GĐ2/GĐ3
 │
 └─→ GĐ1 (Postgres) ─→ GĐ2 (đăng nhập) ─→ GĐ3 (hai vùng khóa) ─→ GĐ4 (cầu nối) ─→ GĐ6
                                                                        │
                                             GĐ5 (Railway) ─────────────┘  làm song song từ sau GĐ1
```

## Không làm trong đợt này

- TikTok (mô hình content video, kho file R2, ngưỡng luật riêng) — đợt sau
- Tự động đăng Reddit (Phase 05 của plan gốc)
- Khóa riêng từng người, phân quyền chi tiết hơn hai vai trò
- Mua chứng chỉ ký số cho file `.exe`
- Script chuyển dữ liệu — dữ liệu hiện có quá nhỏ, nhập lại tay

## Rủi ro lớn nhất

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| ~~Spike GĐ0 trượt → cầu nối phải đi hết đường tab nhỏ~~ | **đã gỡ** | Đo 04/08/2026: đường gọi ngầm chạy được, giữ nguyên thiết kế kèm 3 ràng buộc ở trên |
| Chrome siết tiếp luật mạng nội bộ sau khi đã xây xong | trung bình | Đường lùi sang tab nhỏ vẫn nguyên. Bí mật vốn đã không đi đường này (quyết định 3) |
| Cầu nối vào đường găng (do chọn bàn giao một lần) | **thấp** | Chưa có ai dùng công cụ nên trượt lịch không chặn ai. Đây là lý do quyết định 8 chọn A: không có người chờ thì không cần đường song song |
| Người low-tech cài `.exe` bị SmartScreen chặn | thấp | Cài hộ qua remote desktop ở GĐ6 |
| Luật firewall WebRTC lặng lẽ hết tác dụng sau khi nâng cấp MultiZen | cao | Ghi vào tài liệu vận hành GĐ6: **không tự nâng cấp MultiZen** |

## Đã trả lời (04/08/2026)

1. **Vận hành Reddit: 1-2 người.** GĐ6 nhẹ hơn dự kiến — chỉ 1-2 máy phải cài MultiZen, cầu nối,
   luật firewall. Cũng nghĩa là vùng khóa operator hiện chỉ phục vụ 1-2 người, và sẽ nở ra khi
   TikTok vào.
2. **Video đang trên Google Drive.** Đợt TikTok sẽ phải chuyển sang kho file riêng (quyết định 7)
   — dữ liệu nguồn có sẵn, không phải dựng từ đầu.
3. **MultiZen chỉ công bố `127.0.0.1:7777`**, không có tài liệu cho đổi địa chỉ nghe. Xác nhận
   quyết định 5 (cầu nối ngoại tuyến) là đúng đường — lùi về Tailscale cũng vẫn phải có cầu nối.
   MultiZen tự ghi: *"Profiles always open as visible desktop windows. There is no headless mode."*

4. **Team bắt đầu dùng trong 1-2 tháng** → làm web chung trước, đúng thứ tự plan này. TikTok làm
   ngay sau, trên nền đã có Postgres + đăng nhập + cầu nối.

## Hai câu từ spike GĐ0 — chốt 05/08/2026

### QĐ 10 — Không đặt policy Chrome. Người cài bấm "Cho phép" hộ, ngay trong buổi cài máy

Câu hỏi gốc đặt sai vế: nó giả định người dùng low-tech đối mặt hộp xin quyền **một mình**.
Không phải — [GĐ6 bước 5](phase-06-ban-giao-team.md) vốn đã có người ngồi trên từng máy qua
remote desktop để cài MultiZen, cài cầu nối và tạo luật firewall WebRTC. Cấp quyền là **thêm
một cú bấm trong buổi đó**, và spike đã đo: cấp một lần thì quyền còn nguyên sau khi đóng mở
lại Chrome, lời gọi sau đó bắn tự động lúc trang nạp.

Vì sao không đặt policy dù nó nghe gọn hơn:

| Lý do | Chi tiết |
|---|---|
| **Không tiết kiệm được dòng code nào** | Policy gỡ được ràng buộc 1 (lời gọi đầu phải nằm trong trình xử lý cú bấm) — nhưng vẫn phải viết code theo ràng buộc 1, vì không thể tin là policy luôn có mặt: máy mới, cài lại Windows, đợt TikTok nở thêm máy. Policy chỉ bỏ được một cú bấm của **kỹ thuật viên**, không bỏ được việc gì của lập trình viên |
| **Thêm một cơ chế hỏng-lặng-lẽ cùng họ** | Rủi ro đang xếp hạng **cao** của cả plan là luật firewall WebRTC lặng lẽ hết tác dụng. Policy hỏng đúng kiểu đó (cài lại máy, đổi trình duyệt là mất) — nhân đôi diện tích "đã hỏng mà không ai biết" để đổi lấy một cú bấm |
| **Policy gắn theo từng trình duyệt** | Chrome và Edge hai nhánh registry khác nhau. Người dùng mở app bằng trình duyệt kia là policy im lặng không áp. Đường cấp quyền thì tự nhiên đúng: trình duyệt nào chưa cấp thì hỏi |
| **n = 1-2 máy** | Lợi thế của policy là quy mô. Ở hai máy nó không trả lại gì, chỉ đòi thêm quyền admin |

**Ràng buộc 2 và 3 của spike vẫn giữ nguyên, không được gỡ** — chúng là thứ biến "quyền bị mất"
thành trạng thái nhìn thấy được thay vì giao diện đứng im. Tài liệu bàn giao vẫn có ảnh hộp xin
quyền, nhưng đóng vai **đường cấp lại** (người dùng lỡ bấm Chặn, xóa dữ liệu site), không phải
đường cấp lần đầu.

> Xem lại khi TikTok vào và số máy vận hành lên 5-6 mà không còn remote desktop từng máy. Lúc
> đó policy + script cài mới đáng — và phải kèm cách kiểm ở `chrome://policy` ghi vào tài liệu
> vận hành, đúng như luật firewall.

### QĐ 11 — Cầu nối KHÔNG tự cập nhật. Tải từ chính web app, và app tự báo khi bản cũ

**Tự cập nhật bị loại vì lý do kiến trúc, không phải vì lười.** Quyết định 5 dựng cả thiết kế
trên tính chất *"cầu nối không có kết nối ra ngoài — chỉ nói chuyện với MultiZen trên cùng máy"*.
Một bộ tự cập nhật **bắt buộc phải đục thủng đúng tính chất đó**. Mà cầu nối là nơi giữ khóa
vùng operator: kênh cập nhật của nó chính là đường đưa khóa giải mã mật khẩu nick ra ngoài nếu
bị chiếm. Không đánh đổi một cú bấm lấy chỗ đó.

**Phát hành:** file `.exe` phục vụ từ chính app trên Railway, sau lớp đăng nhập của GĐ2.
Không dựng hệ thống thứ hai, không có URL công khai, và quyền tải đã bị danh sách email chặn sẵn.
87 MB × 1-2 máy × vài bản một năm là lượng tải không đáng bàn.

**Việc thật không phải phát hành, mà là biết mình đang chạy bản cũ.** [GĐ4 bước 8](phase-04-cau-noi-tren-may-operator.md)
đã có trang trạng thái hiện phiên bản — cho cầu nối gửi kèm phiên bản trong mọi phản hồi, và web
app hiện dải *"cầu nối bản cũ, tải bản mới ở đây"*. Cùng nguyên tắc với phần còn lại của dự án:
biến "đang chạy bản sai" từ im lặng thành nhìn thấy được.

**Kèm theo, bắt buộc:** vé của GĐ3 mang số phiên bản tối thiểu. Cầu nối quá cũ phải từ chối kèm
câu *"bản cầu nối quá cũ, tải lại"* — chứ không phải hỏng mơ hồ ở bước giải mã khi định dạng vé
đổi.

> Không mua chứng chỉ ký số (quyết định plan này) nghĩa là **mỗi bản mới lại gặp SmartScreen**.
> Đó là thêm một lý do phát hành thưa và có chủ ý, thay vì cập nhật liên tục.

### QĐ 12 — Gói cầu nối cất trên R2, app lấy hộ

**Chốt 06/08/2026, và làm luôn trong ngày** — sớm hơn mốc kích hoạt đã hẹn ở cuối mục này. Lý do
đổi ý: `/relay-download` trên Railway là một nút bấm vào ra trang trống, tức một trạng thái hỏng
**nhìn thấy được** ngay trong buổi bàn giao đầu tiên. Phần "chưa làm ngay" bên dưới giữ nguyên làm
ghi chép về cách cân nhắc, không còn là trạng thái.

QĐ 11 đã định *team tải từ đâu* (từ app, sau lớp đăng nhập). Câu còn hở hẹp
hơn: **file bằng cách nào lên tới máy chủ** — vì `relay/dist/` bị gitignore (87 MB, dựng lại được),
nên gói `.zip` không nằm trong ảnh Docker và `/relay-download` trên Railway đang nói *"chưa có gói"*.

**Chốt: ngăn riêng trên Cloudflare R2.** Người tải bấm nút trên web → app kiểm phiên đăng nhập →
app tự lấy file từ R2 rồi stream về. Người tải không thấy địa chỉ ngăn, không có chìa, không có
URL công khai nào. Giữ trọn QĐ 11.

Chọn R2 vì **nó đã có sẵn** — dựng 06/08 cho việc sao lưu hằng đêm. Không thêm hãng, không thêm
hóa đơn, không thêm món phải nhớ khi chuyển nhà (khác volume: volume không đi theo thùng Docker,
đục một lỗ vào QĐ 9).

**Đã viết** (06/08/2026): `headObject` + `getObject` cho [r2-client.ts](../../src/lib/r2/r2-client.ts),
nhánh đọc-từ-R2 ở [relay-release-r2.ts](../../src/lib/relay/relay-release-r2.ts), và bộ phát hành
[publish-relay-release.ts](../../scripts/publish-relay-release.ts) (`npm run relay:publish`). Module
R2 dời từ `lib/backup/` sang `lib/r2/` vì nay nó phục vụ hai tính năng — tên cũ nói dối.

Hai chỗ lệch so với ước tính ban đầu, cả hai đều đáng:

- **`headObject` chứ không chỉ `getObject`.** Trang tải cần dung lượng, mốc phát hành và mã băm ở
  *mỗi lượt xem*, nhưng không cần nội dung. Chỉ có `getObject` thì mỗi lượt mở trang kéo 32 MB về
  để in ra một dòng chữ.
- **Mã băm đính vào metadata lúc phát hành**, không băm lại ở máy chủ. Cùng lý do, và nó giữ nguyên
  mức tin cậy cũ: con số vẫn đi cùng đường với file, vẫn không phải chữ ký số.

> ⚠️ **Bucket riêng + token riêng, chỉ đọc.** KHÔNG nới token sao lưu hiện có. Token này nằm cùng
> chỗ với `VAULT_KEY_SERVER`; một chìa mở được mọi ngăn ở đó **mở rộng** thiệt hại của một lần
> chiếm máy chủ chứ không thu hẹp nó. Ngăn gói cài chứa thứ công khai được — mất nó không mất gì;
> ngăn sao lưu thì không.

**Ba đường bị loại, và lý do:**

| Đường | Vì sao loại |
|---|---|
| Volume Railway + upload tay | Railway **không có nút upload** — "upload tay" nghe như một thao tác, thực tế là một quy trình phải nghĩ ra (`railway ssh`, hoặc dựng endpoint tạm rồi gỡ). Và volume không đi theo thùng Docker |
| GitHub Releases, web giữ link | **Mở lại QĐ 11**, không phải một đánh đổi thường. Repo private nên vẫn cần đăng nhập GitHub — nhưng đó là **tập người khác** với `ALLOWED_EMAILS`. Điểm mạnh thật của nó: mã băm và file ở hai miền tin cậy khác nhau |
| CI Windows build + bake vào ảnh | **Không tự đứng được.** Railway build ảnh từ repo; artifact Windows không có ở đó nên Dockerfile vẫn phải tải về từ *một chỗ chứa nào đó*. Nó là lớp tự động chồng lên A/B/D, không thay được chúng. Kèm: build bắt buộc chạy trên runner Windows (SEA gói runtime máy build), tính phí gấp đôi |

~~**Chưa làm ngay, và đây là phần cố ý.**~~ Đợt bàn giao chỉ 1-2 máy Reddit, người cài ngồi cạnh
máy — chép gói bằng USB là xong. Viết code cho một đường phát hành mà mỗi năm dùng vài lần, trong
lúc proxy quan sát viên và Facebook đang chặn nghiệm thu, là đảo thứ tự.

~~**Mốc kích hoạt — làm khi CHẠM MỘT trong hai:**~~

1. **Đợt TikTok vào.** Mọi người đều cần MultiZen, số máy nở ra, chép tay hết rẻ.
2. **Có bản cầu nối thứ hai phải phát.** Lúc đó dải *"cầu nối bản cũ, tải bản mới ở đây"* bắt đầu
   trỏ vào chỗ trống — lỗ hổng thành thật, không còn là giả định.

> **Vì sao làm sớm hơn cả hai mốc.** Lý lẽ hoãn ở trên cân *chi phí viết code* với *tần suất dùng*,
> và bỏ sót một cột thứ ba: `/relay-download` không phải một tính năng vắng mặt mà là một **màn
> hình hỏng đang bày ra**. Người đầu tiên được bàn giao sẽ mở đúng trang đó, và câu "chưa có gói,
> nhờ ADMIN gửi file qua chat" dựng lại đúng thói quen mà QĐ 11 sinh ra để dẹp. Phần code hóa ra
> cũng rẻ hơn ước tính vì bộ ký SigV4 đã có sẵn.

## Câu chưa trả lời (historical snapshot; superseded)

*(trống — hai câu của spike GĐ0 đã chốt ở trên)*
