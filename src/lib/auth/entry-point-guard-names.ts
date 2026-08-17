/**
 * Tên các wrapper gác lối vào, và những đường cố ý không gác.
 *
 * Ở riêng một file **không import gì cả**, và đó là toàn bộ lý do file này tồn tại:
 * `guarded-entry-points.test.ts` cần đúng mấy danh sách chuỗi này để biết hình dạng nào là
 * hợp lệ. Nếu nó phải import từ `guarded-action.ts` thì kéo theo `require-actor` →
 * `auth-server` → và test đòi phải có sẵn `GOOGLE_CLIENT_ID` mới chạy được — một phép kiểm
 * tĩnh về hình dạng mã nguồn lại phụ thuộc credential của Google.
 *
 * Danh sách khai một chỗ, hai bên cùng đọc: thêm wrapper mới mà quên khai ở đây thì test đỏ,
 * chứ không lặng lẽ coi là đã gác.
 */

/** Wrapper hợp lệ cho server action — xem `guarded-action.ts`. */
export const ACTION_GUARDS = ["guardedAction", "adminAction"] as const;

/**
 * Wrapper hợp lệ cho route handler — xem `guarded-route.ts`.
 *
 * `machineOrGuardedRoute` cho phép một chìa máy-tới-máy đi thẳng, nên nó **nới** phạm vi so với
 * hai cái kia. Nó có tên ở đây vì quyết định "ai được gọi" vẫn nằm trong module xác thực; đường
 * sai là xuất một handler trần rồi tự kiểm ở thân hàm, vì dòng đó quên được và lách được.
 */
export const ROUTE_GUARDS = [
  "guardedRoute",
  "adminRoute",
  "machineOrGuardedRoute",
  "machineRoute",
] as const;

/**
 * Route cố ý KHÔNG gác.
 *
 * `/api/auth/[...all]` là đường Better Auth phục vụ chính việc đăng nhập — gác nó lại là khóa
 * cửa rồi để chìa bên trong. Better Auth tự lo phần bảo vệ của nó (kiểm `state` chống CSRF,
 * kiểm chữ ký, kiểm hết hạn).
 *
 * Thêm đường vào danh sách này là một quyết định phải giải thích được ngay tại đây, không
 * phải cách làm cho test xanh.
 */
export const UNGUARDED_ROUTES_BY_DESIGN = ["src/app/api/auth/[...all]/route.ts"] as const;

/**
 * Lối vào CHƯA gác — **đã rỗng từ 05/08/2026**.
 *
 * Đây KHÔNG phải danh sách miễn trừ. Nó là hàng đợi việc, và nó có hạn chót cứng: bước cuối
 * cùng của Phase 02 là bỏ cờ `-H 127.0.0.1` khỏi `package.json`, tức gỡ hàng rào duy nhất
 * đang bảo vệ kho danh tính. Còn một dòng nào ở đây mà đã bỏ cờ `-H` thì lối vào đó thành
 * endpoint công khai trên internet, không cần đăng nhập.
 *
 * Hai tính chất giữ cho danh sách này không mục:
 *
 * 1. **Không thêm được dòng mới trong im lặng.** File mới chưa gác mà không có tên ở đây thì
 *    test đỏ ngay — code mới không bao giờ lùi được.
 * 2. **Dòng thừa cũng làm test đỏ.** Gác xong một file mà quên xóa tên khỏi đây thì test báo
 *    "đã gác rồi, xóa khỏi danh sách" — nên nó không thể âm thầm phình ra rồi ở lại mãi.
 *
 * Lịch sử: lập 05/08/2026 với 18 file (sau khi `vault-credential-actions.ts`, đường lộ
 * credential, đã gác xong), rút về rỗng cùng ngày — 30 server action và 5 route handler còn
 * lại đều đã bọc. Đó là điều kiện đã hẹn trước để được bỏ cờ `-H`.
 *
 * **Giữ mảng này lại dù đang rỗng.** Xóa hẳn thì lần sau ai đó thêm một lối vào chưa gác sẽ
 * không có chỗ nào để khai, và cách dễ nhất để làm test xanh trở lại là nới lỏng phép kiểm.
 * Để rỗng thì con đường dễ nhất là gác cho đúng.
 */
export const NOT_YET_GUARDED = [] as const;
