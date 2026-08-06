# Cấp khóa operator theo máy — bỏ mã mời

**Trạng thái:** code xong, chờ nghiệm thu trên máy thật · **Nhánh:** `fix/bo-cai-cau-noi-bom-va-smartscreen`

Cả 3 phase đã làm. `npm run typecheck` + `npm run lint` sạch, **967/967 test xanh** (+23).
Chưa nghiệm thu được đường hai máy: tới 06/08/2026 chưa có máy nào ngoài máy admin chạy cầu nối.

## Vì sao

Bản mã mời (chưa commit) chở `VAULT_KEY_OPERATOR` bằng **một bí mật đối xứng gửi qua chat**.
Kéo theo: phải hết hạn 24h, phải one-time, phải có endpoint `consume` **không gác được**, blob
nằm lại DB, và cầu nối phải tự gọi ra mạng (trái QĐ 5).

Hệ đã có sẵn đúng primitive cần dùng: [`sealForDevice`](../../src/lib/tickets/ticket-sealed-box.ts)
— X25519 ephemeral + HKDF + AES-GCM, bọc cho **đúng một máy nhận**, và file đó vốn chạy cả trên
máy chủ lẫn trong `.exe` cầu nối. Bọc cho khóa công khai của máy nhận thì cả năm vấn đề trên biến
mất cùng lúc, không phải sửa từng cái.

## Trải nghiệm đích

| Ai | Làm gì |
|---|---|
| Nhân viên | chạy bộ cài → mở web app → bấm **Cài máy này** → đợi dải chuyển xanh. Không thấy khóa, không dán gì, không mở `localhost` |
| ADMIN | thấy hàng **"Đang chờ cấp khóa"** → bấm **Cấp khóa**. Một cú bấm |

Quyết định đã chốt với user (06/08/2026): **giữ** bước ADMIN duyệt · **không** báo ra ngoài
(badge trên web là đủ) · **bỏ hẳn** đường mã mời, không giữ song song.

## Bất biến phải giữ

1. Máy chủ **không bao giờ** mở được `VAULT_KEY_OPERATOR` — chỉ giữ hộ cái hộp đã khóa.
2. Cầu nối **không phát ra thứ mà chính người gọi mở được**. `/wrap-vault-key` cũ vi phạm.
3. Cầu nối **không tự gọi ra mạng** (QĐ 5) — trình duyệt vẫn là người đưa thư.
4. Không thêm lối vào nào chưa gác — `guarded-entry-points.test.ts` phải xanh.

## Phase

| # | Việc | File |
|---|---|---|
| 01 | Dữ liệu + hợp đồng + cầu nối | [phase-01](phase-01-du-lieu-va-cau-noi.md) |
| 02 | Server action + giao diện | [phase-02](phase-02-server-action-va-giao-dien.md) |
| 03 | Test + tài liệu | [phase-03-test-va-tai-lieu.md](phase-03-test-va-tai-lieu.md) |

## Phụ thuộc

- `20260806114211_add_relay_invite` **đã áp vào DB dev** → không xóa thư mục migration đó.
  Migration mới `DROP TABLE "RelayInvite"` + thêm cột. Xóa folder là gây drift cho máy đã chạy.
- Đổi `RELAY_PATHS` = đổi giao kèo với mọi `.exe` ngoài kia → tăng `RELAY_VERSION` 4 → 5.
