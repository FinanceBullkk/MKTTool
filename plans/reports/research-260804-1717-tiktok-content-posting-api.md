# Tra cứu: TikTok Content Posting API cho MKTTool

**Ngày:** 04/08/2026
**Câu hỏi:** Có dùng được API chính thức của TikTok để đăng bài cho nhiều nick nhân vật không?
**Kết luận:** **Không.** TikTok nêu đích danh use case này là không được chấp nhận.

---

## 1. Phát hiện quyết định

Guidelines chính thức của Content Posting API loại thẳng mô hình "công cụ nội bộ":

> "API Clients must not be limited to test applications and should be intended for a wide audience,
> not limited to internal groups/private use."

Và liệt kê ví dụ **không được chấp nhận**:

> "A utility tool to help upload contents to the account(s) you or your team manages. ❌"

Đó là mô tả nguyên văn MKTTool. Không phải vùng xám — là ví dụ mẫu về thứ bị từ chối.

Thêm điều kiện xung khắc:

> "API Clients should facilitate authentic creators to post original content to TikTok."

Mô hình nhiều nick nhân vật do một team vận hành không khớp "authentic creators".

## 2. Hai chế độ và giới hạn

| | Direct Post (`video.publish`) | Upload vào inbox (`video.upload`) |
|---|---|---|
| Kết quả | đăng thẳng lên tường | rơi vào inbox/nháp, người tự mở app TikTok bấm đăng |
| Cần audit riêng? | **Có** | Nguồn thứ ba nói không; docs chính thức không nói rõ |
| Đăng được công khai? | chỉ sau khi qua audit | người tự chọn khi bấm đăng trong app |

**Ràng buộc khi chưa qua audit** (guidelines viết cho "API Client", không viết cho từng endpoint):

- Nội dung chỉ ở chế độ `SELF_ONLY`
- "All user accounts using the API client to post must be set to private at the time of posting"
- **Tối đa 5 user đăng trong 24 giờ**

Ràng buộc áp cho cả client đã audit:
- Creator cap theo số khai trong đơn audit
- ~15 bài/ngày/creator qua Direct Post

## 3. Audit thực tế

- 2-4 tuần, nhiều vòng phản hồi
- Đòi: video quay lại toàn bộ luồng đăng, URL chính sách bảo mật, bằng chứng tích hợp nằm trong sản phẩm hoàn chỉnh
- Bắt buộc hiển thị username + avatar của creator trước mỗi lần đăng (được kiểm trong review)
- Với use case ở mục 1 thì gần như chắc chắn trượt

## 4. Điều kiện kỹ thuật (nếu giả sử qua được)

- Video: MP4 + H.264, tối đa 300 giây; `FILE_UPLOAD` (chunked) hoặc `PULL_FROM_URL` (domain phải xác minh)
- Ảnh: **chỉ** `PULL_FROM_URL`, không upload file local, endpoint `/v2/post/publish/content/init/`
- `upload_url` sống 1 giờ
- Mỗi nick phải tự OAuth cấp quyền cho app

## 5. Tín hiệu phát hiện đa nick của TikTok — khớp với luật sẵn có

Community Guidelines nhắm hành vi, không nhắm quyền sở hữu nhiều nick. Ba tín hiệu mạnh nhất:

| Tín hiệu TikTok bắt | Luật MKTTool đã có |
|---|---|
| Nick của cùng chủ like/comment/follow lẫn nhau | **Luật 8** — đụng độ thread |
| Nội dung trùng/gần trùng, metadata giống hệt | **Luật 7** — trùng nội dung |
| Tạo 5+ nick/ngày từ một thiết bị | cold-start + 1 nick = 1 profile = 1 proxy |

Nghĩa là thiết kế hiện tại đã đi đúng hướng cho TikTok, không phải làm lại từ đầu.

## 6. Hệ quả cho kiến trúc

1. **TikTok cùng dạng với Reddit**, không cùng dạng với Fanpage: MultiZen + đăng tay.
2. Xác nhận **mọi người trong team đều cần MultiZen** → phương án "web chung + cầu nối nhỏ trên máy" là đúng.
3. **Khoảng trống sản phẩm mới:** `ContentItem` hiện là tiêu đề + thân bài (text). TikTok là video — cần chỗ chứa/trỏ file video, ảnh bìa, caption, hashtag. Luật 7 (so text) không so được video, nhưng so **caption + hashtag** thì vẫn có giá trị, vì đó chính là "identical metadata" mà TikTok bắt.
4. Ngưỡng luật 4/5/6 phải tách theo nền tảng (TikTok 3-5 video/ngày là bình thường).

## 7. Chưa chắc chắn

1. Ràng buộc "chưa audit" có áp cho luồng inbox không — docs chính thức không nói, nguồn thứ ba nói ngược nhau. Chỉ biết chắc bằng cách dựng client thử.
2. Kể cả nếu inbox thoát ràng buộc, vẫn phải qua app review cơ bản — cùng bộ phận đọc cùng mô tả sản phẩm ở mục 1.
3. Chưa tra: TikTok có API riêng cho Business/Ads account không (khác nhánh Content Posting).

## Nguồn

- [Content Posting API Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines)
- [Content Posting API — Get Started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [Upload Video reference](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)
- [TikTok Developer Terms of Service](https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en)
