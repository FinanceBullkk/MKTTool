# Phase 03 — Test + tài liệu

**Ưu tiên:** trung bình · **Trạng thái:** chờ phase 02

## Test phải có

`relay/src/handle-seal-operator-key.test.ts`
- từ chối khi `Origin` không phải nguồn tin
- từ chối khi chưa có khóa operator
- bọc xong thì **đúng máy nhận mở được**, máy khác mở không được

`relay/src/handle-receive-operator-key.test.ts`
- hộp của máy khác → từ chối, **không ghi file**
- ruột mở được nhưng không phải 64 hex → từ chối, **không ghi file**
- ghi thành công **giữ nguyên `multizenToken`** đang có (chống lại đúng lỗi bản mã mời mắc)

**Đổi so với dự kiến.** Định viết `relay-emits-nothing-openable.test.ts` quét cả `relay/` để canh
bất biến *"không route nào phát ra khóa"*. Bỏ, vì mọi cách diễn đạt bất biến đó ở tầng mã nguồn
đều brittle (bám tên biến) và sẽ đỏ sai nhiều hơn đỏ đúng. Thay bằng hai thứ hẹp hơn nhưng chắc:

- Một ca **trong** `handle-seal-operator-key.test.ts` soi nguyên phản hồi dạng chuỗi, khẳng định
  khóa không nằm ở **bất kỳ trường nào** — bắt đúng lỗi của `/wrap-vault-key` mà không bám tên trường.
- `src/lib/relay/relay-paths-are-wired.test.ts` — mọi đường khai trong `RELAY_PATHS` phải có mặt
  trong `relay/src/main.ts`. Khai mà quên đấu thì không gì đỏ, và triệu chứng là 404 kèm câu nói
  về lệch phiên bản — câu chỉ nhầm nguyên nhân. Kèm một ca chặn hai tên cũ quay lại.

## Tài liệu

- `README.md` mục **Cầu nối** → viết lại phần "Đăng ký máy trước khi dùng" theo luồng mới; bỏ
  câu "Hỏi quản trị viên — khóa này KHÔNG nằm trên máy chủ" ở chỗ mô tả bước cài
- `docs/project-changelog.md` — một dòng
- `relay/src/relay-config.ts` — sửa chú thích QĐ 5 nếu còn nói sai

## Xong khi

- [ ] `npm test` xanh toàn bộ
- [ ] README mô tả đúng thứ người dùng thật sự phải làm
