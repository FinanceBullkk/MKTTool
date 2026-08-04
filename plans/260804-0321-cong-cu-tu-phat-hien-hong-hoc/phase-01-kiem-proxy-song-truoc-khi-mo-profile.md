# Phase 01 — Kiểm proxy sống trước khi mở profile

**Ưu tiên:** Cao · **Trạng thái:** ✅ Xong 04/08/2026 (`8216ec9`) · [← plan](plan.md)

## Vấn đề

`launch/route.ts` dựng ba lớp chặn với chú thích *"proxy hỏng thì không mở"*. Nhưng lớp thứ ba
chỉ kiểm **đẩy được cấu hình sang MultiZen không**, không kiểm **proxy có còn thở không**. Xong
việc, nó trả về một câu:

> *"Vẫn nên mở ipinfo.io kiểm tra IP khớp proxy trước khi thao tác — đẩy thành công không bảo
> đảm proxy còn sống."* — `launch/route.ts:94`

Grep cả `src/`: `ipinfo` xuất hiện **đúng một lần**, chính là chuỗi trên. Công cụ biết vấn đề,
biết cách kiểm, và giao lại cho người dùng.

Ảnh chụp MultiZen 04/08/2026: cả hai profile đều `proxy unreachable`. Công cụ không hay biết.

## Đo cái gì mới đúng

So IP ra với `proxy.host` là **sai**: host là cổng vào, IP ra thường khác (nhất là residential).
Phép đo đúng gồm ba câu hỏi, và câu thứ hai mới là câu quan trọng:

| Đo | Kết luận | Chặn mở profile? |
|---|---|---|
| Không nối được qua proxy | **CHẾT** | ✅ Chặn |
| IP ra **trùng IP nhà** | **RÒ** — proxy không được áp dụng, đang chạy bằng IP nhà | ✅ Chặn |
| Quốc gia lệch `proxy.country` | **LỆCH NƯỚC** | ⚠️ Cho qua, nói rõ |
| Không gọi được cả hai đường | **KHÔNG KIỂM ĐƯỢC** | ⚠️ Cho qua, nói rõ |
| Còn lại | **OK** kèm IP ra | — |

Nhánh **RÒ** là nhánh đáng tiền nhất: proxy trả lời bình thường nhưng lưu lượng vẫn đi bằng IP
nhà — đúng kiểu hỏng mà `launch/route.ts` sợ nhất và hiện không ai phát hiện được.

"Không kiểm được" **không được** rơi vào ô OK — cùng nguyên tắc với bộ dò shadowban.

## Không thêm dependency

`undici` không resolve được trong dự án (đã thử `require('undici')` → MISSING), mà `ProxyAgent`
lại nằm ở đó. Thay vì thêm dep, gọi `http://ipinfo.io/json` bằng **plain HTTP**:

- **Proxy HTTP** — `node:http` với absolute-form request line, không cần `CONNECT`, không cần TLS.
  Khoảng 20 dòng.
- **Proxy SOCKS5** — bắt tay SOCKS5 thủ công trên `node:net` (greeting → auth → connect), rồi
  `http.request({ createConnection })` trên socket đã mở. Khoảng 70 dòng.

Plain HTTP chấp nhận được vì thứ duy nhất gửi đi là `Proxy-Authorization` — tới đúng proxy vốn
đã biết mật khẩu của chính nó. Không có credential nick nào đi qua đường này.

## File

**Tạo**
- `src/lib/proxies/proxy-exit-ip-probe.ts` — hỏi IP ra qua một proxy, hai nhánh giao thức
- `src/lib/proxies/proxy-socks5-tunnel.ts` — bắt tay SOCKS5, tách riêng cho `probe` dễ đọc
- `src/lib/proxies/proxy-liveness-verdict.ts` — **hàm thuần** so kết quả → kết luận, test không cần mạng
- `src/lib/proxies/proxy-liveness-check.ts` — ghép probe + verdict + ghi DB
- `src/lib/proxies/proxy-check-actions.ts` — server action: kiểm một proxy / kiểm tất cả
- `src/components/proxies/proxy-check-controls.tsx` — nút + hiện kết quả
- `src/lib/proxies/proxy-liveness-verdict.test.ts`

**Sửa**
- `prisma/schema.prisma` — `Proxy`: thêm `lastCheckedAt`, `lastCheckVerdict`, `lastCheckDetail`, `lastExitIp`
- `src/app/proxies/page.tsx` — cột "Lần kiểm gần nhất" + nút kiểm tất cả
- `src/app/api/accounts/[id]/launch/route.ts` — kiểm trước khi đẩy; CHẾT/RÒ thì không mở
- `src/app/page.tsx` — dải cảnh báo proxy hỏng

## Các bước

1. Migration thêm 4 cột vào `Proxy` (`npm run db:migrate`).
2. `proxy-liveness-verdict.ts` trước — hàm thuần, viết test luôn. Đây là chỗ chứa quyết định.
3. `proxy-socks5-tunnel.ts` + `proxy-exit-ip-probe.ts`, timeout 10 giây mỗi lượt.
4. `proxy-liveness-check.ts`: lấy IP nhà một lần rồi dùng lại cho cả mẻ (cache trong tiến trình,
   TTL ngắn) — kiểm 8 proxy không nên gọi ipinfo 16 lần.
5. Server action + UI ở `/proxies`.
6. Chặn ở `launch/route.ts`: đặt **trước** `applyProxy`, vì đẩy proxy chết vào profile rồi mới
   phát hiện là đã muộn.
7. Dải cảnh báo ở trang Hôm nay, đọc từ DB — không gọi mạng lúc render trang.

## Xong là khi

- `/proxies` hiện được proxy nào chết mà không phải mở MultiZen.
- Bấm "Mở profile" với proxy chết → **không mở**, kèm câu nói rõ chết ở đâu.
- Trang Hôm nay hiện cảnh báo khi có proxy hỏng ở lần kiểm gần nhất.
- Test của `proxy-liveness-verdict.ts` phủ đủ 5 nhánh kết luận.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| ipinfo.io giới hạn tần suất | 8 proxy/lượt, kiểm theo yêu cầu chứ không tự chạy. Lỗi HTTP → KHÔNG KIỂM ĐƯỢC, không phải CHẾT |
| Bắt tay SOCKS5 viết sai → báo chết nhầm | Verdict tách khỏi probe; lỗi giao thức phải ra KHÔNG KIỂM ĐƯỢC, không ra CHẾT |
| Thêm 1-3 giây vào mỗi lần mở profile | Chấp nhận: đổi lấy việc không mở nhầm profile bằng IP nhà |
| Máy không có mạng | IP nhà lấy hỏng → KHÔNG KIỂM ĐƯỢC → vẫn mở được profile |

## Bảo mật

Không có credential nick nào đi qua đường này. `Proxy-Authorization` chỉ tới đúng proxy đang
kiểm. IP ra ghi vào DB dạng thường (không phải bí mật, và cần đọc được để đối chiếu).
