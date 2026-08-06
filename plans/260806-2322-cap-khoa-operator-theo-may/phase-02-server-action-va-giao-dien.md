# Phase 02 — Server action + giao diện

**Ưu tiên:** cao · **Trạng thái:** chờ phase 01

## Sửa / tạo / xóa

**Sửa**
- `src/lib/audit/audit-log-actions.ts` — `RELAY_INVITE_CREATED` → `RELAY_OPERATOR_KEY_GRANTED`
- `src/lib/tickets/relay-device-actions.ts` — bỏ `createRelayInvite`; thêm
  `grantOperatorKeyToDevice` (`adminAction`)
- `src/lib/tickets/relay-enrollment-actions.ts` — thêm `readOperatorKeyGrant` +
  `markOperatorKeyDelivered` (`guardedAction`, ép chủ máy hoặc ADMIN)
- `src/lib/relay/relay-browser-client.ts` — thêm `sealOperatorKey()` + `receiveOperatorKey()`
- `src/components/relay/relay-enroll-card.tsx` — 4 trạng thái, tự nhận khóa, tự làm mới
- `src/app/relay-devices/page.tsx` — mục "Đang chờ cấp khóa" + cột trạng thái khóa; bỏ thẻ mã mời;
  thụt lại khối JSX bị lệch

**Tạo**
- `src/components/relay/relay-grant-key-button.tsx`

**Xóa**
- `src/app/api/relay-invites/` · `src/components/relay/relay-invite-card.tsx`

## Bốn trạng thái của thẻ "Cài máy này"

| Máy đang ở đâu | Hiện | Nút |
|---|---|---|
| chưa tìm thấy cầu nối | lời nhắc + lưu ý quyền mạng nội bộ | **Tìm cầu nối** |
| thấy, chưa vào sổ | form tên máy (+ chọn chủ nếu ADMIN) | **Đăng ký & cấu hình** |
| vào sổ rồi, chưa có khóa | "Đã gửi yêu cầu tới quản trị viên. Máy sẽ tự sẵn sàng khi được duyệt." | *(tự làm mới 10s)* |
| đủ | "Máy này đã sẵn sàng." | — |

Phân biệt bằng `/health`: `deviceId` có = đã vào sổ · `configured` = đủ cả khóa operator.
Không dùng lại `configured` để suy ra "đã đăng ký" — hai câu hỏi khác nhau.

## Điểm phải viết đúng

- Tự làm mới **chỉ chạy ở trạng thái 3**, và chỉ sau khi đã ping thành công một lần bằng cú bấm
  (ràng buộc 1 — LNA). Dò tự động ngay lúc mở trang là cách chắc chắn để mọi máy mới đều thấy
  "không tìm thấy cầu nối".
- `markOperatorKeyDelivered` **xóa luôn** `operatorKeyGrant`. Blob đã tới nơi thì giữ lại chỉ là
  thêm một thứ để rò.
- Nút "Cấp khóa" đòi cầu nối **của chính admin** đang chạy và đã có khóa — nói thẳng câu đó khi
  thiếu, không để lỗi nổ ở bước cuối.
- Máy đã nhận khóa vẫn cấp lại được (nhãn đổi thành **Cấp lại khóa**) — cần sau mỗi lượt
  `vault:rekey`.

## Xong khi

- [ ] `guarded-entry-points.test.ts` xanh — không còn lối vào chưa gác
- [ ] `npm run typecheck` + `npm run lint` sạch
