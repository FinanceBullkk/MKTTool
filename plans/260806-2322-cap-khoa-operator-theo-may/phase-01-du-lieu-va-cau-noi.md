# Phase 01 — Dữ liệu + hợp đồng + cầu nối

**Ưu tiên:** cao · **Trạng thái:** đang làm

## Kiến trúc

```
ADMIN bấm "Cấp khóa"
  trình duyệt admin ──POST /seal-operator-key { recipientPublicKey }──> cầu nối CỦA ADMIN
                     <──{ ephemeralPublicKey, sealed }──
  trình duyệt admin ──grantOperatorKeyToDevice(deviceId, grant)──> máy chủ (lưu, mở không nổi)

Nhân viên mở web app
  trình duyệt NV ──readOperatorKeyGrant(deviceId)──> máy chủ ──{ grant }──>
  trình duyệt NV ──POST /receive-operator-key { grant }──> cầu nối CỦA NV (mở bằng khóa riêng)
  trình duyệt NV ──markOperatorKeyDelivered(deviceId)──> máy chủ (xóa blob)
```

## Sửa / tạo / xóa

**Sửa**
- `prisma/schema.prisma` — bỏ `RelayInvite` + `User.relayInvites`; `RelayDevice` thêm 3 cột:
  `operatorKeyGrant String?` · `operatorKeyGrantedAt DateTime?` · `operatorKeyDeliveredAt DateTime?`
- `src/lib/relay/relay-endpoints.ts` — bỏ `wrapVaultKey`/`consumeInvite`; thêm
  `sealOperatorKey: "/seal-operator-key"` + `receiveOperatorKey: "/receive-operator-key"`;
  thêm type `SealedOperatorKeyGrant`, `SealOperatorKeyRequest`, `SealOperatorKeyReply`;
  `RELAY_VERSION` 4 → 5
- `relay/src/main.ts` — đấu hai đường mới
- `relay/src/relay-status-page.ts` — trả lại "Hai bước để xong", bước 2 nói đúng luồng mới

**Tạo**
- `relay/src/handle-seal-operator-key.ts`
- `relay/src/handle-receive-operator-key.ts`
- `prisma/migrations/<ts>_grant_operator_key_per_device/migration.sql`

**Xóa**
- `relay/src/handle-wrap-vault-key.ts` · `relay/src/handle-consume-invite.ts`

## Điểm phải viết đúng

- `/seal-operator-key` kiểm `Origin === allowedOrigin` trong thân hàm (giống `handle-configure`),
  không nhờ CORS. Chưa có khóa operator → từ chối kèm `notConfiguredMessage()`.
- `/receive-operator-key` **được phép** nhận từ web app — khác `/set-operator-key`. Lý do: thứ đi
  qua là hộp đã khóa, web app mở không nổi. Nhận cả từ `RELAY_ORIGIN`.
- Mở hộp xong **phải kiểm 64 ký tự hex** trước khi ghi. Hộp mở được nhưng ruột rác = ghi vào là
  làm hỏng máy đang chạy tốt.
- Ghi bằng `writeRelayConfig({ vaultKeyOperator })` — **patch, không ghi đè cả file**. Ghi đè là
  mất `multizenToken`, đúng lỗi bản mã mời mắc.

## Xong khi

- [ ] `npx prisma migrate dev` áp sạch, `RelayInvite` biến mất
- [ ] `npm run typecheck` + `npm run lint` sạch
- [ ] Không còn chuỗi `invite` nào trong `relay/` và `src/`
