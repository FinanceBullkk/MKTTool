# Công cụ tự phát hiện hỏng hóc, thay vì bắt người dùng tự nhớ

**Ngày:** 04/08/2026 · **Nhánh:** `feat/rut-gon-luong-dang-bai` · **Đợt:** 3 (sau *rút gọn luồng*
và *băng chuyền*)

## Vì sao có đợt này

Hai đợt trước rút ngắn **đường đi** của người dùng (4 trang → 2, nav 9 mục → 4). Đợt này sửa
loại ma sát khác: những chỗ công cụ **biết có vấn đề nhưng không tự kiểm**, chỉ in ra một câu
nhắc rồi để người dùng tự làm.

Ba chỗ đó, tìm bằng cách đọc code chứ không đoán:

| Chỗ | Bằng chứng | Hậu quả khi quên |
|---|---|---|
| Proxy chết | `ipinfo` xuất hiện đúng 1 lần trong `src/`, và là trong một **chuỗi chữ** (`launch/route.ts:94`) | Nick chạy bằng IP nhà, hoặc mở profile với proxy đã chết |
| Token Facebook chết | `page.tsx` có 3 dải cảnh báo, không dải nào đọc `tokenValid` | Chỉ lộ ra đúng lúc cần đăng gấp |
| Fanpage đúng giờ | `buildPagePostPayload` không gửi `scheduled_publish_time` | Phải ngồi canh giờ bấm nút |

Đo được khi làm xong: mở trang **Hôm nay** là biết có gì hỏng không, **không cần mở terminal
và không cần mở MultiZen**. Hiện tại chưa đạt — proxy chết chỉ thấy được trên giao diện MultiZen.

## Các phase

| # | Phase | Ưu tiên | Trạng thái |
|---|---|---|---|
| 01 | [Kiểm proxy sống trước khi mở profile](phase-01-kiem-proxy-song-truoc-khi-mo-profile.md) | Cao | ✅ Xong 04/08/2026 |
| 02 | [Cảnh báo token Facebook ở trang Hôm nay](phase-02-canh-bao-token-facebook-o-trang-hom-nay.md) | Cao | ✅ Xong 04/08/2026 |
| 03 | [Hẹn giờ đăng Fanpage bằng Facebook](phase-03-hen-gio-dang-fanpage-bang-facebook.md) | — | ❌ Không làm (chốt A, 04/08/2026) |

Đợt này khép lại ở hai phase.

### Lệch so với plan, do đo thật

Phase 01 dự tính dùng **một** dịch vụ tra cứu (`ipinfo.io`). Lượt đo đầu trên 10 proxy Webshare
cho 429 ở hai IP và 403 ở một IP, **lặp lại y hệt** ở lượt sau — chặn theo IP, không phải giới
hạn tần suất. Một nhà cung cấp duy nhất nghĩa là 3/10 proxy vĩnh viễn "không kiểm được", nên
thêm `proxy-ip-lookup-providers.ts` với chuỗi dự phòng `ipinfo.io` → `ip-api.com` →
`icanhazip.com`. Sau khi thêm: 10/10.

## Phase 03 đã chốt: không làm

`facebook-page-publisher.ts` mở đầu bằng một quyết định đã ghi lại:

> *Tự lên lịch ở tool chứ KHÔNG dùng `scheduled_publish_time` của Facebook: để mọi thứ nằm một
> chỗ và bộ luật còn kiểm được trước lúc bấm.*

Lý do đó **không sai**. Bài đã giao cho Facebook giữ thì trong khoảng từ lúc hẹn tới lúc lên,
bộ luật mất quyền chặn: nick bị shadowban, tỷ lệ promo đổi, một job khác chen vào — không thứ
nào ngăn được bài đã hẹn nữa. Nặng nhất là `recheck-jobs-batch` chấm ra **BỊ CHẶN** trong khi
Facebook vẫn đăng đúng giờ: giao diện nói một đằng, thực tế một nẻo.

**Chốt ngày 04/08/2026: giữ nguyên cách cũ.** Đổi *ngồi canh giờ bấm đăng* lấy *thỉnh thoảng
bấm đối chiếu* thì vẫn lãi, nhưng cái giá nằm ở nhánh thu hồi thất bại — hiếm, khó test, hỏng
thì hỏng im lặng. Chưa đáng khi số Fanpage còn ít.

[phase-03](phase-03-hen-gio-dang-fanpage-bang-facebook.md) giữ lại nguyên vẹn để lần sau ai đề
xuất lại thì đọc được vì sao đã bỏ, thay vì cân nhắc lại từ đầu.

## Không làm trong đợt này, có chủ ý

- **Nút "Dò cả đàn" ở `/health`** — đúng vấn đề (banner cảnh báo mà không kèm đường xử lý), nhưng
  chạy 8 nick mất gần 10 phút nên phải có tiến trình nền và cách hiện tiến độ. Đợt riêng.
- **Điền sẵn form ghi tương tác sau khi bấm "Đã đăng"** — giá trị cao, nhưng đụng đúng luật 8
  (luật duy nhất không cho ghi đè), nên tách ra để test cho kỹ.
- **`navigate` thẳng vào trang soạn bài** sau khi mở profile — để chung với Phase 05, vì cùng
  chạm tool MCP của MultiZen.
- **Nhập hàng loạt content, nhắc sao lưu** — nhập liệu ban đầu, không phải việc hằng ngày.

## Kiểm chứng chung

`npm run typecheck` + `npm run lint` + `npm test` phải xanh. Không chạy `npm run build`
(máy 16GB thường chỉ còn 2-3GB trống).
