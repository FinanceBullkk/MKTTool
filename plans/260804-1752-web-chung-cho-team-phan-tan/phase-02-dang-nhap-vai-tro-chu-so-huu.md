# Phase 02 — Đăng nhập, vai trò, chủ sở hữu nick

## Context

- [plan.md](plan.md) — quyết định 2, 4
- Phụ thuộc: [Phase 01](phase-01-postgres-va-mui-gio-team.md)
- 19 file server action + 5 route handler (danh sách ở mục Related Code Files)

## Overview

**Ưu tiên:** cao | **Trạng thái:** chưa làm | **Dự kiến:** 3-4 ngày

Từ "ai mở được trang là làm được mọi thứ" sang "đăng nhập bằng Google, có vai trò, nick có chủ".

Đây là phase gỡ bỏ hàng rào cũ (`-H 127.0.0.1`) và dựng hàng rào mới. **Không được để khoảng
giữa**: bỏ cờ `-H` chỉ khi đăng nhập đã chặn xong toàn bộ 24 lối vào.

## Key Insights

- Hàng rào duy nhất hôm nay là chỗ app lắng nghe. Đưa lên internet mà thiếu một lối vào chưa gác
  là **kho danh tính thành trang web công khai** — không phải lỗi nhỏ.
- Quyết định 2 chọn khóa chung, nên **máy chủ từ chối đưa ciphertext là thứ duy nhất** ngăn người
  này đọc bí mật nick người kia. Chặn phải nằm ở tầng dữ liệu, **không phải ẩn nút trên giao diện**.
- Ngược lại, **tầm nhìn thì không chia**: luật 8 cảnh báo "nick khác vừa hoạt động cùng đích" và
  phải nêu đúng tên nick của đồng nghiệp thì người đọc mới xử lý được.
- Danh sách email cho phép là bắt buộc — thiếu nó thì bất kỳ ai có Gmail cũng đăng nhập được.
- `AuditLog` hiện không có cột actor và **không hồi tố được** → thêm ở phase này, không để sau.

## Requirements

1. Đăng nhập Google; chỉ email nằm trong danh sách cho phép mới vào được
2. Hai vai trò: `ADMIN`, `OPERATOR`
3. Mỗi nick có chủ sở hữu; chỉ chủ (hoặc ADMIN) lấy được bí mật của nick đó
4. Mọi server action và route handler đều được gác
5. `AuditLog` ghi được ai làm

## Architecture

```
Google  ──►  Better Auth  ──►  phiên
                                 │
                    ┌────────────┴─────────────┐
             requireSession()            requireNickOwner(accountId)
             (24 lối vào)                (chỉ đường lấy bí mật)
```

Một helper duy nhất cho mỗi loại chặn. Không rải logic quyền khắp nơi.

## Related Code Files

**Tạo:**
- `src/lib/auth/` — cấu hình Better Auth, `require-session.ts`, `require-role.ts`, `require-nick-owner.ts`
- `src/app/login/` — màn hình đăng nhập
- `src/lib/auth/allowed-emails.ts` — đọc danh sách từ biến môi trường
- test chặn: quét mọi file `"use server"` và `route.ts`, đỏ nếu thiếu gác

**Sửa (19 server action):** `vault-create-actions`, `vault-credential-actions`, `vault-delete-actions`,
`vault-update-actions`, `content-item-actions`, `facebook-page-actions`, `facebook-publish-action`,
`health-check-run-actions`, `observer-proxy-actions`, `proxy-bandwidth-actions`, `proxy-check-actions`,
`interaction-actions`, `post-job-actions`, `post-job-mark-posted`, `post-job-revert`,
`post-job-status-actions`, `recheck-jobs-batch`

**Sửa (5 route handler):** `api/accounts/[id]/launch`, `api/facebook/oauth/callback`,
`api/facebook/oauth/start`, `api/health/run`, `api/rules/preview`

**Sửa schema:** `Account.ownerId`, `AuditLog.actorId`, model `User` của Better Auth
**Sửa:** `package.json` — bỏ `-H 127.0.0.1` ở `start` (**bước cuối cùng của phase**)

## Implementation Steps

1. Better Auth + Google provider + danh sách email cho phép. Không có tự đăng ký
2. Schema: `User`, `Account.ownerId`, `AuditLog.actorId`. Migration
3. Ba helper: `requireSession`, `requireAdmin`, `requireNickOwner`
4. Gác 19 server action — mỗi file một dòng ở đầu mỗi hàm export
5. Gác 5 route handler. Giữ nguyên `isSameOrigin` đang có, **thêm chứ không thay**
6. `requireNickOwner` cho `revealCredential` và `requestOtpCode`
7. Mọi chỗ ghi `AuditLog` đính `actorId` từ phiên
8. Màn hình phân công nick cho ADMIN
9. Bộ lọc "nick của tôi" trên `/accounts` và `/queue` — **chỉ lọc hiển thị**
10. Viết test quét: file `"use server"` nào không gọi helper gác → đỏ
11. **Rà lại `rule-context-queries.ts`: mọi truy vấn của bộ luật vẫn phải quét TOÀN BỘ nick**
12. Bỏ `-H 127.0.0.1` khỏi `start`

## Todo List

- [ ] Better Auth + Google + danh sách email cho phép
- [ ] Schema `User`, `Account.ownerId`, `AuditLog.actorId`
- [ ] `requireSession` / `requireAdmin` / `requireNickOwner`
- [ ] Gác đủ 19 server action
- [ ] Gác đủ 5 route handler
- [ ] Bí mật nick chỉ chủ mới lấy được
- [ ] `AuditLog` ghi actor ở mọi đường
- [ ] Màn hình phân công nick (ADMIN)
- [ ] Bộ lọc "nick của tôi" (chỉ hiển thị)
- [ ] Test quét lối vào chưa gác
- [ ] Xác nhận truy vấn bộ luật KHÔNG bị lọc theo chủ sở hữu
- [ ] Bỏ cờ `-H` (làm cuối cùng)

## Success Criteria

- Đăng nhập bằng email ngoài danh sách → **bị từ chối**
- Người A gọi thẳng server action lấy mật khẩu nick của người B (bỏ qua giao diện) → **bị từ chối**
- Người A vẫn **thấy** nick, job, lịch sử của B, và vẫn nhận cảnh báo luật 8 nêu đúng tên nick của B
- Test quét lối vào chạy xanh; cố tình thêm một action không gác → **test đỏ**

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Sót một lối vào chưa gác | **cao** | Test quét tự động, không rà bằng mắt |
| Lọc nhầm truy vấn bộ luật theo chủ sở hữu → luật 8 mù | **cao** | Bước 11 tách riêng; smoke test `rules` phải còn xanh |
| Bỏ cờ `-H` trước khi gác xong | cao | Đặt là bước cuối cùng, ghi rõ trong todo |

## Security Considerations

- Danh sách email ở biến môi trường, không ở database — sửa được mà không cần ai có quyền admin trong app
- Phiên đăng nhập: cookie `HttpOnly` + `Secure` + `SameSite=Lax`
- `isSameOrigin` hiện có **giữ nguyên**, đăng nhập là lớp thêm chứ không phải lớp thay
- Chưa tách hai vùng khóa ở phase này → **một phiên bị trộm vẫn đọc được mật khẩu**.
  Lỗ này đóng ở [Phase 03](phase-03-tach-hai-vung-khoa-va-ve-ky.md), chưa bàn giao trước đó

## Next Steps

Xong → [Phase 03](phase-03-tach-hai-vung-khoa-va-ve-ky.md).
