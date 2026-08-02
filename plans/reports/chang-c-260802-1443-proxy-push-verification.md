# Chặng C — kiểm proxy đẩy tự động có ăn không

**Ngày:** 02/08/2026 · **Kết quả: ĐẠT** · Đầu vào bắt buộc của Phase 05.

## Bố trí phép thử

| Thành phần | Giá trị |
|---|---|
| Proxy | `webshare-01-gb` — `31.59.20.176:6754`, HTTP, Webshare free |
| Profile MultiZen | `3ae761bb-9f41-4177-b8aa-07b523d0b172` (tên "Test") |
| Nick | `test-01` (giả, chưa từng đăng nhập đâu) |
| Proxy nhập tay trong MultiZen | **không có** — đây là điểm mấu chốt |
| IP nhà | `14.169.109.47` (VN) |

Proxy chỉ tồn tại trong `dev.db` của MKTTool. Nếu profile ra IP Anh thì chỉ có thể do MKTTool
đẩy sang, không có đường nào khác.

## Kết quả

Bấm "Mở profile" → `POST /api/accounts/{id}/launch` trả `ok: true`, thứ tự lời gọi MCP đúng
`update_profile` → `launch_profile`.

Lái profile vào `ipinfo.io/json` bằng tool MCP `navigate` + `extract`:

```json
{ "ip": "31.59.20.176", "city": "London", "country": "GB",
  "org": "AS205544 Leaseweb UK Limited", "timezone": "Europe/London" }
```

**IP khớp proxy.** Tiêu chí Chặng C đạt.

## Đo thêm bằng `evaluate_js`

```json
{ "lang": "sv-SE", "langs": ["sv-SE","sv","en"], "tz": "Europe/London",
  "offset": -60, "platform": "Win32", "ua": "…Chrome/146.0.0.0…" }
```

Vân tay của profile lúc đó đặt `Locale = Svenska (Sverige)`, `Timezone = Europe/Stockholm`.
So với giá trị đo được khi chạy qua proxy GB:

| Chiều | Cấu hình profile | Đo lúc chạy | Đánh giá |
|---|---|---|---|
| Múi giờ | `Europe/Stockholm` | `Europe/London`, offset −60 | ✅ MultiZen **ghi đè lúc chạy** theo IP proxy, không sửa cấu hình |
| Ngôn ngữ | `Svenska (Sverige)` | `sv-SE` | ❌ giữ nguyên — tiếng Thụy Điển trên IP Anh |

Tài liệu trước đây ghi MultiZen tự căn cả ngôn ngữ. **Sai** — đã sửa trong `README.md`,
`phase-00`, và chú thích `multizen-adapter.ts`.

**Cách xử lý:** tab Fingerprint trong GUI có nút **"Match proxy"** — căn vân tay theo proxy,
nhưng phải bấm tay. Quy trình cho 11 profile thật: gắn proxy → bấm "Match proxy" → **rồi mới**
đăng nhập lần đầu. Đổi sau khi nick đã nuôi thì đừng: nick dùng `sv-SE` ba tháng rồi nhảy sang
`en-GB` còn đáng ngờ hơn là để lệch.

Cố ý KHÔNG cho MKTTool tự đẩy `fingerprint.localeId` mỗi lần mở profile, dù `update_profile`
có nhận field đó — lý do ngay ở trên.

## Đo rò WebRTC (02/08/2026) — đã phát hiện và đã bịt

**Ban đầu: JS không lộ IP, nhưng gói UDP vẫn rời máy bằng IP nhà.**
**Sau khi chặn UDP bằng firewall: `srflx` = 0, không còn đường ra.**

Cờ khởi động của cloakbrowser (đọc từ command line PID 5452) cho thấy MultiZen bật đủ ba lớp:

```
--fingerprint-webrtc-ip=auto
--force-webrtc-ip-handling-policy=disable_non_proxied_udp
--enforce-webrtc-ip-permission-check
--proxy-server=socks5://127.0.0.1:62770     ← cầu SOCKS5 nội bộ, DNS phân giải từ xa
--lang=sv-SE --accept-lang=sv-SE,sv,en      ← nguồn của lệch ngôn ngữ ở trên
--disable-features=DnsOverHttps,AsyncDns,…  ← chặn DoH đi vòng qua proxy
```

Đọc ICE candidate trong chính profile:

```json
{"webrtc":"ENABLED",
 "candidates":["… auto 63601 typ host …","… auto 63602 typ host …",
               "… auto 63601 typ srflx raddr auto …","… auto 63602 typ srflx raddr auto …"],
 "sdp":["c=IN IP4 auto"]}
```

Mọi địa chỉ bị thay bằng chuỗi `auto` — trang web đọc qua JS **không thấy IP nào**, kể cả IP LAN.

### Nhưng round-trip STUN là thật

Chạy lại với STUN server không tồn tại (`stun:192.0.2.1:19302`): chỉ còn candidate `host`,
`srflx` biến mất. Vậy lần trước gói UDP **có** tới được `stun.l.google.com` thật.

Chụp UDP endpoint **đúng lúc đang gom candidate**:

| Tiến trình | UDP endpoint |
|---|---|
| `MultiZen.exe` (cầu SOCKS5, PID 8788) | **không có socket UDP nào** |
| `chrome.exe` NetworkService của profile (PID 26688) | `0.0.0.0:61490`, `[::]:61491` |

Cầu SOCKS5 không chuyển tiếp UDP; trình duyệt tự mở socket UDP trên **mọi giao diện**. Nên gói
STUN đi thẳng ra ngoài, và server STUN thấy IP nhà (`14.169.109.47`), không phải IP proxy.

### Ý nghĩa thực tế

- Site đọc candidate qua JS (mọi trang kiểm rò rỉ thông thường, và cả Reddit/Facebook) → thấy
  `auto`, **không rò**.
- Site **tự chạy STUN/TURN server riêng** thì thấy IP thật. Reddit và Facebook không làm việc này
  trong luồng web thường → rủi ro thực tế thấp, nhưng lỗ vẫn còn.
- Không đo được trực tiếp server STUN ghi nhận IP nào (không quan sát được từ trong trình duyệt);
  kết luận trên là suy ra từ hai phép đo trên, không phải quan sát trực tiếp.

### Không chỉnh được từ MultiZen

MCP không phơi tuỳ chọn WebRTC nào (22 tool, không tool nào nhắc tới), không file cấu hình JSON
nào trong `%APPDATA%\MultiZen` nhắc tới `webrtc`, và **GUI cũng không có** — đã xem hết 5 tab
General / Browser / Proxy / Extensions / Fingerprint. Masking nằm trong bản chromium đã vá.

Đáng chú ý: MultiZen **đã** đặt sẵn `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`
mà UDP vẫn ra được. Lớp bảo vệ đó không hiệu lực trong cấu hình này (nhiều khả năng Chrome coi
proxy SOCKS5 là có hỗ trợ UDP nên cho phép gửi, dù cầu không thật sự chuyển tiếp).

### Chặn bằng Windows Firewall — ĐÃ BỊT ĐƯỢC

Đã tạo luật chặn UDP ra ngoài cho đúng `chrome.exe` của cloakbrowser:

```powershell
New-NetFirewallRule -DisplayName "MultiZen cloakbrowser - block outbound UDP (WebRTC leak)" `
  -Direction Outbound -Action Block -Protocol UDP -Profile Any -Enabled True `
  -Program "…\MultiZen\chromium\cloakbrowser\146.0.7680.177.5\chrome.exe"
```

Lần đầu tạo luật xong đo lại: **`srflx` vẫn còn nguyên**. Nguyên nhân không phải luật sai mà là
firewall của máy đang tắt:

| Profile firewall | Lúc đầu | Sau khi sửa |
|---|---|---|
| Domain | bật | bật |
| Private | **tắt** | tắt |
| Public ← mạng đang dùng ("Anh Hao") | **tắt** | **bật** |

Không phần mềm bên thứ ba nào chiếm quyền firewall (chỉ Windows Defender). Dấu hiệu nhận ra:
`EnforcementStatus = NotApplicable` trên luật vừa tạo.

```powershell
Set-NetFirewallProfile -Profile Public -Enabled True
```

Đánh đổi: Windows chặn kết nối **vào** theo mặc định — mất truy cập dashboard từ máy khác trong
nhà (dùng `localhost` thì không ảnh hưởng), chia sẻ file/máy in, RDP.

### Kết quả sau khi bật (02/08/2026)

Đóng profile → mở lại từ MKTTool → đo lại ICE:

```
candidate:406142691 1 udp 2113937151 auto 52469 typ host
candidate:767234133 1 udp 2113939711 auto 52470 typ host
srflx: 0
```

**Chỉ còn candidate `host`, `srflx` biến mất hoàn toàn** — trùng khớp với kết quả đối chứng lúc
trỏ vào STUN server không tồn tại. Gói UDP không ra được nữa.

Duyệt web không hề chậm đi: Wikipedia 4,8s → 2,4s, Bing 6,6s → 1,2s (nhanh hơn do cache, không
phải nhờ firewall — điều cần khẳng định là **không có suy giảm**). IP vẫn đúng proxy:
`31.59.20.176` / London / GB.

Kết luận: Chrome không dùng QUIC/UDP khi đã cấu hình proxy, nên chặn UDP không mất gì.

**Bẫy dài hạn:** đường dẫn luật có số phiên bản chromium (`146.0.7680.177.5`). Cập nhật MultiZen
là đường dẫn đổi và luật **lặng lẽ hết tác dụng**, không báo gì. Sau mỗi lần nâng cấp MultiZen:
tạo lại luật rồi đo lại ICE (`srflx` phải bằng 0).

### Ghi chú phụ

`reddit.com/r/selfhosted` trả **"Prove your humanity"** — đây là **danh tiếng IP** của proxy free,
không liên quan firewall (đo trước khi bật firewall cũng vậy). Đúng như cảnh báo trong `phase-00`:
proxy Webshare free không dùng cho nick thật được, kể cả để đọc.

## Thử đường SOCKS5 (02/08/2026)

Webshare phục vụ **cả HTTP lẫn SOCKS5 trên cùng một cổng** — không cần tải danh sách riêng, chỉ
đổi trường Giao thức ở `/proxies` là xong.

Đổi `webshare-01-gb` sang `socks5` → đóng profile → mở lại từ MKTTool:

| | HTTP | SOCKS5 |
|---|---|---|
| IP thấy được | 31.59.20.176 GB | 31.59.20.176 GB |
| Wikipedia | 2,4s | 3,6s |
| Bing | 1,2s | 1,6s |
| ICE `srflx` | 0 | 0 |
| DNS resolver (đo qua `edns.ip-api.com`) | **31.59.20.176** (Leaseweb UK) | **31.59.20.176** (Leaseweb UK) |

Mốc đối chiếu — DNS trực tiếp từ máy, không qua proxy: `172.217.43.157`, Google Singapore.

**Kết luận: chọn giao thức nào cũng được.** DNS phân giải từ xa trong **cả hai** chế độ, vì cầu
SOCKS5 nội bộ của MultiZen (`--proxy-server=socks5://127.0.0.1:<port>`) mới là thứ trình duyệt
nói chuyện; giao thức upstream chỉ là chặng sau đó. Không có lợi thế DNS nào riêng cho SOCKS5
như dự đoán ban đầu.

Chọn theo cái nhà cung cấp hỗ trợ ổn hơn. Đã trả `webshare-01-gb` về `http`.

## Chất lượng 10 proxy Webshare free

9/10 nối được, mỗi con ra đúng IP của nó. Quốc gia rải rác, **không phải toàn US**:

| Nhãn | IP:port | Quốc gia |
|---|---|---|
| `webshare-01-gb` | 31.59.20.176:6754 | GB |
| `webshare-02-us` | 31.56.127.193:7684 | US |
| `webshare-03-gb` | 45.38.107.97:6014 | GB |
| `webshare-04-gb` | 198.105.121.200:6462 | GB |
| `webshare-05-es` | 64.137.96.74:6641 | ES |
| `webshare-06-us` | 198.23.243.226:6361 | US |
| `webshare-07-us` | 38.154.185.97:6370 | US |
| `webshare-08-pt` | 84.247.60.125:6095 | PT |
| `webshare-09-jp` | 142.111.67.146:5611 | JP |
| `webshare-10-us` | 191.96.254.138:6185 | US |

`webshare-05-es` bị **chính ipinfo.io trả 403** (IP nằm danh sách đen của họ) — tra qua
`ip-api.com` thì bình thường. Đúng bản chất datacenter dùng chung, không phải lỗi cấu hình.

Nhập vào DB bằng `scripts/import-proxies-from-provider-list.ts` (mới), mật khẩu mã hóa
AES-256-GCM như mọi credential khác.

## Cạm bẫy gặp phải

1. **File proxy tải về dùng CRLF.** `\r` lọt vào cuối mật khẩu làm curl báo
   *"Unsupported proxy syntax … Malformed input to a URL function"*, trông hệt như proxy chết.
   Script nhập liệu đã cắt `\r`.
2. **Tool `evaluate_js` nhận `expression`, không phải `script`.** Sai tên trả `INVALID_INPUT`.

## Việc còn treo
- Chưa thử đổi proxy khi profile **đang mở**. Code luôn đẩy trước khi mở nên không đụng, nhưng
  nếu profile đã mở sẵn thì `launch_profile` có thể no-op và phiên cũ giữ IP cũ.
- 10 proxy này **chỉ để test**. Nick thật vẫn phải chờ static ISP mua riêng — xem lưu ý về quốc
  gia nick trong `phase-00`.
