# Phase 03 — Hẹn giờ đăng Fanpage bằng Facebook

**Trạng thái:** ❌ **Không làm — chốt phương án A ngày 04/08/2026** · [← plan](plan.md)

> **Quyết định:** giữ nguyên cách cũ. Fanpage vẫn bấm tay đúng giờ; bộ luật giữ quyền phủ quyết
> tới giây cuối. Chú thích đầu `facebook-page-publisher.ts` vẫn đúng, không sửa.
>
> Giữ file này lại để lần sau có ai đề xuất `scheduled_publish_time` thì đọc được **vì sao đã
> cân nhắc rồi mà không làm**, thay vì cân nhắc lại từ đầu. Nếu đổi ý thì phần "Nếu chốt B thì
> làm gì" bên dưới vẫn dùng được.

## Cơ hội

`buildPagePostPayload` gửi đúng `{ message, link }`. Graph API có sẵn `scheduled_publish_time`
+ `published=false` — Facebook tự giữ bài rồi đăng đúng giờ. **Không cần cron, không cần tiến
trình nền, không cần máy bật.**

Với Fanpage, "xếp lịch" sẽ đổi từ *ghi giờ dự kiến rồi tự nhớ bấm* thành *hẹn giờ thật*. Đây là
thứ tiết kiệm nhiều công nhất trong cả đợt, và tốn ít code nhất.

## Nhưng nó đi ngược một quyết định đã ghi lại

`facebook-page-publisher.ts` mở đầu bằng:

> *Tự lên lịch ở tool chứ KHÔNG dùng `scheduled_publish_time` của Facebook: để mọi thứ nằm một
> chỗ và bộ luật còn kiểm được trước lúc bấm. Bài đẩy sang Facebook là đăng ngay.*

**Lý do đó đúng.** Bài đã giao cho Facebook giữ thì trong khoảng từ lúc hẹn tới lúc lên, bộ luật
mất quyền chặn:

- Nick chuyển sang `SHADOWBANNED` sau khi hẹn → luật 1 chặn được job mới, không chặn được bài đã hẹn.
- Một job khác đăng trước → tỷ lệ promo 9:1 lệch đi, luật 6 không còn cách nào can thiệp.
- `recheck-jobs-batch` chấm lại và ra **BỊ CHẶN** → job đổi màu trên giao diện, còn Facebook thì
  vẫn đăng đúng giờ. Giao diện nói một đằng, thực tế một nẻo — kiểu hỏng tệ nhất của cả dự án.

Vế cuối là vế nghiêm trọng: nó không chỉ mất một lớp bảo vệ, nó làm **giao diện nói dối**.

## Ba cách đi, chọn một

**A. Giữ nguyên quyết định cũ.** Bỏ phase này. Fanpage vẫn bấm tay đúng giờ. Đổi lại bộ luật
giữ nguyên quyền phủ quyết tới giây cuối.

**B. Hẹn giờ + tự thu hồi khi luật đổi ý.** Hẹn qua Facebook, nhưng `recheck-jobs-batch` khi
chấm một job đã hẹn thành **BỊ CHẶN** thì gọi Graph xóa/lùi bài đã hẹn ngay. Giữ được cả hai
thứ, nhưng thêm một đường mạng vào chỗ hiện đang thuần database, và phải xử lý trường hợp
thu hồi thất bại (mạng hỏng, token chết) — lúc đó giao diện **phải** nói rõ "đã chặn ở đây
nhưng chưa gỡ được bên Facebook".

**C. Hẹn giờ trần, không thu hồi.** Rẻ nhất, và là cách làm giao diện nói dối. Không nên.

**Khuyến nghị: A cho đợt này, B cho đợt sau nếu việc canh giờ thật sự phiền.** Lý do: cái giá
của B nằm ở nhánh *thu hồi thất bại* — nhánh hiếm, khó test, và hỏng thì hỏng im lặng. Chưa
đáng đổi khi số Fanpage còn ít và vẫn ngồi cạnh máy.

## Nếu chốt B thì làm gì

**Sửa**
- `facebook-post-payload.ts` — nhận `scheduledPublishTime?: Date`, gửi kèm `published=false`
- `facebook-page-publisher.ts` — bỏ/viết lại chú thích đầu file (đừng để nó mâu thuẫn với code)
- `facebook-publish-action.ts` — nhánh hẹn giờ
- `content-types.ts` — thêm trạng thái `SCHEDULED` vào `JOB_STATUSES`, `ACTIVE_JOB_STATUSES`
  (chiếm chỗ trong bộ luật) nhưng **không** vào `OPEN_JOB_STATUSES`
- `recheck-jobs-batch.ts` — nhánh thu hồi
- `README.md` — câu *"Xếp lịch không phải là hẹn giờ tự đăng"* phải viết lại cho riêng Fanpage

**Ràng buộc của Facebook:** mốc hẹn phải cách hiện tại **10 phút – 75 ngày**. Ngoài khoảng đó
Graph trả lỗi — phải validate ở tool trước, đừng để lộ ra bằng lỗi API.

**Ai lật `SCHEDULED` → `POSTED`?** Không tự lật theo giờ: Facebook vẫn có thể đăng hỏng, và ghi
`POSTED` cho một bài chưa lên là bơm dữ liệu sai vào đúng chỗ bộ luật và bộ dò shadowban đọc.
Phải đối chiếu thật bằng `GET /{post_id}?fields=is_published` — một nút "Đối chiếu bài đã hẹn"
kiểu giống "Kiểm tra token tất cả Page".

Tức là B **không xóa hết việc tay**, nó đổi *ngồi canh giờ bấm đăng* thành *thỉnh thoảng bấm
đối chiếu*. Vẫn lãi, nhưng nên biết trước khi chọn.

## Câu hỏi chờ trả lời

1. Chọn A, B hay C?
2. Nếu B: thu hồi thất bại thì job về trạng thái nào, và cảnh báo hiện ở đâu?
