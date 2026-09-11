/**
 * Gác **trang**. Chưa đăng nhập thì không trang nào hiện ra.
 *
 * Tên file là `proxy.ts` chứ không phải `middleware.ts`: Next 16 đổi quy ước và cảnh báo
 * `middleware` đã lỗi thời. Cùng một cơ chế, chỉ khác tên file và tên hàm export.
 *
 * ## Vì sao cần file này dù đã gác đủ 35 lối vào
 *
 * `guardedAction` / `guardedRoute` gác đường **làm**, không gác đường **đọc**. Trang trong
 * `app/` là server component tự gọi thẳng Prisma rồi trả HTML — nó không đi qua wrapper nào.
 * Nên trước file này, chưa đăng nhập vẫn mở được `/accounts` và `/proxies` và đọc sạch: username
 * từng nick, email gốc, host/port/username của từng proxy, toàn bộ content và lịch sử job.
 *
 * Chuyện đó chỉ thành lỗ hổng thật khi cờ `-H 127.0.0.1` bị bỏ — trước đó chỉ máy sở tại mở
 * được. Bỏ cờ mà chưa có file này là mở kho danh tính cho cả lớp mạng.
 *
 * ## Vì sao kiểm THẬT chứ không chỉ xem có cookie hay không
 *
 * Cách phổ biến ở middleware là ngó xem cookie phiên có tồn tại không rồi cho qua — nhanh, chạy
 * được ở edge runtime. Nhưng nó phá đúng lời hứa đang ghi trong README: *"gỡ email khỏi
 * `ALLOWED_EMAILS` rồi khởi động lại là có hiệu lực ngay, kể cả người đó đang mở sẵn tab"*.
 * Cookie của người vừa bị gỡ vẫn còn nguyên và vẫn hợp lệ, nên phép kiểm theo cookie sẽ cho họ
 * đọc tiếp cho tới lúc cookie hết hạn — bảy ngày.
 *
 * Vì vậy ở đây gọi đúng `checkActor()` mà server action dùng: hỏi database về phiên, rồi đối
 * chiếu `ALLOWED_EMAILS`. Đắt hơn, nhưng đây là công cụ nội bộ cho 5-6 người, và cái rẻ kia
 * mua bằng việc nói dối tài liệu.
 *
 * ## Đây là lớp thứ hai, không phải lớp duy nhất
 *
 * Server action và route handler vẫn tự gác độc lập — không cái nào tin rằng middleware đã
 * chạy. Hai lớp cùng chặn một người, nhưng chúng hỏng theo hai kiểu khác nhau, và lịch sử
 * Next.js đã có ít nhất một lỗi cho phép vượt middleware bằng một header tự chế.
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkActor } from "@/lib/auth/require-actor";

export async function proxy(request: NextRequest) {
  const check = await checkActor(request.headers);
  if (check.ok) return NextResponse.next();

  const url = new URL("/login", request.url);
  if (request.nextUrl.pathname === "/setup" && check.needsLogin) {
    url.searchParams.set("callbackURL", "/setup");
  }

  // Đã đăng nhập nhưng bị gỡ khỏi danh sách trắng: đẩy về /login mà không nói gì thì màn hình
  // chỉ mời đăng nhập lại — họ đăng nhập lại thành công, rồi lại bị đẩy về đây, vòng vô tận mà
  // không có chữ nào giải thích. Nói thẳng ra là hết quyền.
  if (!check.needsLogin) {
    url.searchParams.set("error", "EMAIL_NOT_ALLOWED");
  }

  return NextResponse.redirect(url);
}

/**
 * ## Không khai `runtime` ở đây — và đó không phải chuyện thẩm mỹ
 *
 * Kiểm phiên thật (hỏi database) bắt buộc phải chạy trên Node runtime: ở edge không có module
 * lõi của Node nên Prisma chết ngay lúc nạp với `Native module not found: node:util/types`, và
 * vì nó chết ở tầng chặn nên **mọi trang** thành 500 chứ không phải một trang. Bản đầu viết
 * ở `middleware.ts` — nơi mặc định LÀ edge — nên phải khai `runtime: "nodejs"` để sống.
 *
 * Đổi sang `proxy.ts` thì điều kiện đó được bảo đảm sẵn: **proxy của Next 16 luôn chạy Node**,
 * và chính vì luôn luôn nên khai lại là lỗi — `Route segment config is not allowed in Proxy file`.
 *
 * Bẫy nằm ở chỗ **`next dev` không kiểm, chỉ `next build` mới kiểm**. Dòng thừa đó chạy tốt
 * suốt buổi nghiệm thu tay rồi mới làm gãy build ở CI. Đây là lý do bước `build` phải nằm
 * trong CI chứ không dựa vào việc dev có chạy được hay không.
 */
export const config = {
  /**
   * Gác mọi đường, trừ bốn nhóm — và cả bốn đều phải nêu lý do:
   *
   * - `api`      — route handler tự gác rồi, và chúng phải trả **401 JSON** chứ không phải
   *                chuyển hướng sang HTML. Nút bấm ở giao diện đọc `response.json()`; đổi
   *                401 thành một trang đăng nhập là biến thông báo "chưa đăng nhập" thành
   *                lỗi phân tích JSON không ai hiểu.
   * - `login`    — không gác được bằng chính đăng nhập, nếu không là vòng lặp chuyển hướng.
   * - `_next`    — tài nguyên build, không có gì bí mật, và chặn thì trang đăng nhập mất sạch
   *                CSS lẫn JavaScript.
   * - `favicon`  — trình duyệt tự xin, chuyển hướng nó chỉ tốn một lượt kiểm phiên vô ích.
   *
   * Mặc định là **gác**: trang mới thêm ngày mai tự động được bảo vệ, không phải nhớ khai thêm
   * ở đâu cả. Đó là lý do dùng danh sách loại trừ chứ không phải danh sách trang cần gác.
   */
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
