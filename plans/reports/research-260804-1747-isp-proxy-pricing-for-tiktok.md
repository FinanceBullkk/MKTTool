# Tra cứu: giá proxy ISP tĩnh cho TikTok (thay proxy datacenter)

**Ngày:** 04/08/2026
**Câu hỏi:** Đăng video TikTok cần loại IP nào, giá thật bao nhiêu, nhà nào phủ đủ nước đang dùng?
**Kết luận:** **IPRoyal dedicated ISP, ~$2,40–2,70/IP/tháng.** Nhà duy nhất tra được hôm nay phủ
đủ cả 5 nước trong kho (GB/US/ES/PT/JP) kèm băng thông không giới hạn.

---

## 1. Giá thật, tra ngày 04/08/2026

| Nhà | Dedicated $/IP/tháng | Băng thông | Số nước | Có ES/PT/JP? |
|---|---|---|---|---|
| **IPRoyal** | **$2,40** (90 ngày) · $2,55 (60) · $2,70 (30) | không giới hạn | 31+ | **Cả ba** — ES 15.923 IP, PT 3.649, JP 8.402 |
| Decodo | $3,33 (tối thiểu 3 IP = $9,99) | không nói rõ | 17 | ES ✅ JP ✅ **PT ❌** |
| Webshare | $1,575–2,52 | bậc 250 GB hoặc không giới hạn | 12+ nêu tên | JP ✅, ES/PT không nêu |
| MarsProxies | $2,79 | — | — | chưa tra |
| Oxylabs | từ $2,10 | — | 11–20+ | ES ✅ PT ❓ |
| Rayobyte | $5,00 | — | ít, thiên US | — |
| NodeMaven | $4,99 | không giới hạn | 9 | — |
| Bright Data | $18,00/10 IP | — | — | — |

## 2. Hai cái bẫy giá

**Bẫy 1 — tầng "shared".** Webshare $0,30/IP và Decodo $0,27/IP là **IP dùng chung**. Định nghĩa
của chính Webshare: *shared* = hơn 2 khách cùng dùng, *private* = 1–2 người, *dedicated* = độc
quyền. Nuôi nick mà dùng chung IP với người lạ thì hành vi của họ tính lên đầu nick mình. Phải
mua **dedicated**, tức nhân giá lên 5–8 lần so với con số quảng cáo.

**Bẫy 2 — số lượng tối thiểu.** Webshare rẻ nhất là gói 20 proxy ($6/tháng). Chỉ cần 3–8 IP thì
con số $6 đó không áp dụng. Decodo tối thiểu 3 IP.

## 3. Tiền cho kho này

Giữ nguyên 10 proxy Webshare datacenter cho Reddit — chúng đúng loại cho việc đó. Khoản dưới đây
là **khoản thêm**, không phải khoản thay.

| Quy mô | IPRoyal 90 ngày | IPRoyal 30 ngày (linh hoạt) |
|---|---|---|
| 2 nick thử nghiệm | $4,80/tháng | $5,40/tháng |
| 3 nick | $7,20 | $8,10 |
| 8 nick | $19,20 | $21,60 |

So với mobile ($30–100/**mỗi** cổng) thì rẻ hơn một bậc độ lớn. Băng thông không giới hạn nên
nhu cầu ~1,5 GB/tháng/nick của video không sinh thêm chi phí nào.

## 4. Khớp với công cụ

- `Proxy.type` đã có sẵn `STATIC_ISP` — nhập vào không cần đổi code.
- IPRoyal trả `host:port:user:pass`, đúng định dạng `npm run proxies:import`.
- Nhập xong bấm **"Kiểm"** để đọc IP ra, rồi tra IP đó ở danh sách đen trước khi gắn nick — phân
  khúc ISP giá thấp hay là IP tái chế.

## 5. Chưa chắc chắn

1. Giá là giá niêm yết, chưa VAT, chưa mã giảm. Chưa kiểm giá thật lúc thanh toán.
2. Số IP theo nước là con số nhà bán tự công bố, không ai kiểm chứng. Có IP trong kho không có
   nghĩa là còn IP để bán ở thành phố/ASN mong muốn.
3. Chưa tra Webshare có ES/PT không — nếu có thì họ rẻ hơn IPRoyal một chút và bạn đã có tài khoản.
4. Không có số liệu nào về **tỉ lệ sống của nick TikTok** theo loại IP. Toàn bộ phần xếp hạng
   mobile > ISP > datacenter là hiểu biết chung của ngành, không phải số đo. Cách duy nhất biết
   chắc là chạy thử 2 nick trong 2–3 tuần.
5. Chưa đo tốc độ **tải lên** của bất kỳ nhà nào — mà đó mới là thứ quyết định khi đăng video.

## Nguồn

- [Webshare — Static Residential](https://www.webshare.io/static-residential-proxy)
- [IPRoyal — Dedicated Residential ISP](https://iproyal.com/other-proxies/dedicated-residential-isp-proxies/)
- [IPRoyal — Static Residential](https://iproyal.com/static-residential-proxies/)
- [Decodo — ISP Proxies](https://decodo.com/proxies/isp-proxies)
- [AIMultiple — Best Static Residential Proxies 2026](https://aimultiple.com/isp-proxies)
