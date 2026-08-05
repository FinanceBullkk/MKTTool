/**
 * Phiên bản của **bản cầu nối này**.
 *
 * Ba con số phiên bản trong hệ, đừng lẫn (hai cái đầu ở `src/lib/tickets/ticket-types.ts`):
 *
 *   `TICKET_FORMAT_VERSION`  hình dạng bao ngoài của vé. Máy chủ khai, cầu nối đối chiếu.
 *   `MIN_RELAY_VERSION`      bản cầu nối tối thiểu máy chủ đòi. Máy chủ khai vào từng tấm vé.
 *   `RELAY_VERSION` (đây)    bản cầu nối đang chạy. Cầu nối tự khai, gửi kèm **mọi** phản hồi.
 *
 * Số này đi vào mọi phản hồi HTTP (QĐ 11 — không có bộ tự cập nhật), để web app tự nhận ra một
 * chiếc máy đang chạy bản cũ và hiện dải *"tải bản mới ở đây"*. Không có nó thì cách duy nhất
 * biết mình chạy bản sai là chờ tới lúc một tấm vé hỏng.
 *
 * **Tăng khi phát hành một bản `.exe` mới có thay đổi người dùng thấy được.** Đây là số phải
 * nhớ tăng bằng tay: tự sinh theo git hash thì nó đổi ở mọi lượt build, và một số đổi liên tục
 * thì cảnh báo "bản cũ" kêu liên tục cho tới lúc không ai còn nhìn.
 */
export const RELAY_VERSION = 1;
