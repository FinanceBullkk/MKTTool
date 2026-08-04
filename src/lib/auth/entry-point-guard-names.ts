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

/** Wrapper hợp lệ cho route handler — xem `guarded-route.ts`. */
export const ROUTE_GUARDS = ["guardedRoute", "adminRoute"] as const;

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
 * Lối vào CHƯA gác — danh sách đang rút dần, phải về **rỗng** trước khi kết thúc Phase 02.
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
 * Ghi ngày để thấy nó nằm đây bao lâu: lập 05/08/2026 với 18 file, sau khi
 * `vault-credential-actions.ts` (đường lộ credential, quan trọng nhất) đã gác xong.
 */
export const NOT_YET_GUARDED = [
  "src/lib/accounts/vault-create-actions.ts",
  "src/lib/accounts/vault-delete-actions.ts",
  "src/lib/accounts/vault-update-actions.ts",
  "src/lib/content/content-item-actions.ts",
  "src/lib/facebook/facebook-page-actions.ts",
  "src/lib/facebook/facebook-publish-action.ts",
  "src/lib/health/health-check-run-actions.ts",
  "src/lib/health/observer-proxy-actions.ts",
  "src/lib/proxies/proxy-bandwidth-actions.ts",
  "src/lib/proxies/proxy-check-actions.ts",
  "src/lib/queue/interaction-actions.ts",
  "src/lib/queue/post-job-actions.ts",
  "src/lib/queue/post-job-status-actions.ts",
  "src/app/api/accounts/[id]/launch/route.ts",
  "src/app/api/facebook/oauth/callback/route.ts",
  "src/app/api/facebook/oauth/start/route.ts",
  "src/app/api/health/run/route.ts",
  "src/app/api/rules/preview/route.ts",
] as const;
