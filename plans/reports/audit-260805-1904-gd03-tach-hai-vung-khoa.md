# Audit GĐ3 — tách hai vùng khóa + sổ đăng ký cầu nối

**Ngày:** 05/08/2026 | **Branch:** `feat/gd03-tach-hai-vung-khoa` | **Phạm vi:** 6/11 việc đã làm
của [phase-03](../260804-1752-web-chung-cho-team-phan-tan/phase-03-tach-hai-vung-khoa-va-ve-ky.md),
gồm cả phần chưa commit.

Audit đọc mã, không sửa gì — dev khác đang làm trên cùng cây.

**Nền:** `npm test` 599/599 xanh (57 file, gồm test database), `npm run typecheck` sạch.

---

## Đáng sửa trước khi làm tiếp

### 1. [CAO] Đường tạo nick không có test nào canh vùng khóa

`vault-edit-actions.database.test.ts` đặt **hai khóa khác nhau** rồi đọc lại bằng khóa operator —
nên `updateAccount` mà mã hóa nhầm bằng khóa server là test đỏ ngay. Đó đúng là cách canh cần có.

Không có gì tương đương cho đường **tạo**. Grep `vault-create-actions` trong `src/` chỉ ra 4 file
`page.tsx`, không có test nào.

Mã hôm nay đúng — [vault-create-actions.ts:88](../../src/lib/accounts/vault-create-actions.ts#L88)
lấy `operatorKey` và truyền vào cả ba cột. Vấn đề là **không có gì giữ nó đúng**, mà việc 7 của
chính phase này sẽ viết lại đúng hàm đó ("ciphertext vùng operator dựng ở phía máy người dùng").

Hỏng thì hỏng muộn và hỏng nặng: nick tạo mới ghi ciphertext bằng khóa **server** vào cột vùng
**operator**. Mọi thứ chạy bình thường suốt lúc hai khóa còn giống nhau. Chỉ tới ngày `vault:rekey
--domain=operator` — tức đúng ngày làm việc nghiệm thu của cả phase — nó mới dừng ở câu "không
giải mã được mật khẩu nick X".

**Sửa:** nhân bản cách làm của `vault-edit-actions.database.test.ts` cho `createAccount`.

### 2. [CAO] `encryptCredential` mặc định im lặng là vùng server

```ts
export function encryptCredential(plaintext: string, key: Buffer = loadVaultKey("server")): string
```

Quên tham số thứ hai = ghi nhầm vùng. Không lỗi, không cảnh báo, không test nào đỏ. Đây đúng là
kiểu hỏng mà cả phase dựng ra để tránh, và plan xếp *"chia nhầm vùng cho một cột"* ở mức **cao**
với biện pháp giảm thiểu ghi là "Registry + test đọc schema" — nhưng registry test chỉ đối chiếu
`schema.prisma` ↔ registry, **không chạm tới chỗ gọi**. Giữa hai thứ đó có một khoảng trống, và
mục 1 ở trên là một lỗ thật nằm trong khoảng trống ấy.

Nguyên tắc của plan là *"khi có nhiều đường, lấy đường bền hơn kể cả khi tốn code hơn"*. Đường bền
ở đây là **bỏ giá trị mặc định**, bắt mọi chỗ gọi khai vùng ra. 12 chỗ gọi ngoài test — chỗ nào
cũng chỉ thêm một tham số, và thêm xong thì "cột này thuộc vùng nào" hiện ngay tại chỗ đọc mã thay
vì phải đi tra registry.

### 3. [TRUNG BÌNH] `vault:rekey` không chặn xoay một vùng sang khóa của vùng kia

[rekey-vault-key.ts:199](../../scripts/rekey-vault-key.ts#L199) chỉ so khóa mới với khóa **cũ của
chính vùng đó**. Nên lệnh này chạy trót lọt:

```
npm run vault:rekey -- --domain=operator --new-key=<đúng giá trị VAULT_KEY_SERVER> --apply
```

Kết quả: hai vùng nhập lại làm một — đúng thứ vừa bỏ công tách ra — và dữ liệu đã bị mã hóa lại
nên không lùi được bằng cách sửa `.env`. Thứ duy nhất còn bắt được là dòng `console.warn` lúc app
khởi động (xem mục 4, nó cũng không đủ tin).

Nhầm kiểu này không xa vời: hai biến nằm cạnh nhau trong `.env`, cùng 64 ký tự hex, và người chạy
lệnh đang mở đúng file đó để chép.

**Sửa:** so `--new-key` với biến môi trường của vùng **kia**, từ chối kèm câu nói rõ đã chép nhầm.

### 4. [TRUNG BÌNH] Cảnh báo "hai vùng đang dùng chung một khóa" chỉ là `console.warn`

[encryption-key-loader.ts:116](../../src/lib/crypto/encryption-key-loader.ts#L116). Chú thích ngay
trên nó nói đúng vấn đề: *"trạng thái ĐÚNG trong lúc chuyển đổi, nhưng phải nói ra, vì cấu hình
nhìn giống hệt lúc đã tách xong"*. Chỉ là chỗ nói ra chọn chưa đúng.

Trạng thái này nghĩa là **toàn bộ GĐ3 chưa có tác dụng gì** — chiếm máy chủ vẫn mở được mật khẩu
nick. Một dòng log trong `stdout` của Railway (GĐ5) là chỗ không ai đọc, và nó in đúng một lần lúc
khởi động rồi trôi.

Dự án đã có lời giải cho đúng lớp vấn đề này ở QĐ 11: cầu nối bản cũ thì web app hiện dải cảnh báo.
Cùng lý lẽ, cùng cách chữa — dải cảnh báo cho ADMIN.

---

## Nhỏ hơn

| # | Chỗ | Việc |
|---|---|---|
| 5 | [relay-device-actions.ts:97-123](../../src/lib/tickets/relay-device-actions.ts#L97) | `findUnique` → `create` có khe TOCTOU. Hai admin dán cùng khóa cùng lúc → P2002 ném ra khỏi server action, nút hỏng không có chữ nào. Bắt P2002 rồi trả đúng câu "khóa này đã có trong sổ" |
| 6 | `/relay-devices` | Chủ máy bị gỡ khỏi `ALLOWED_EMAILS` sau khi đăng ký thì máy vẫn hiện "đang dùng". Không khai thác được (phát vé kiểm actor), nhưng sổ nói sai — và sổ này tồn tại để trả lời "máy của tôi ổn chưa". Thêm badge cảnh báo |
| 7 | `TICKET_SIGNING_KEY` | Không lệnh nào kiểm nó trước khi cần dùng. Thiếu hoặc dán hụt ký tự thì chỉ lộ lúc ai đó bấm nút — mà GĐ5 đặt biến bằng tay trên Railway. `auth:check` đã là tiền lệ cho việc kiểm trước |
| 8 | `AuditLog.action` | Chuỗi literal rải rác 4 chỗ (`RELAY_DEVICE_REGISTERED`, `RELAY_DEVICE_REVOKED`, `CREDENTIAL_REVEALED`, `PROFILE_LAUNCHED`). Gõ sai một chữ = hàng vẫn ghi, nhưng không truy vấn nào tìm ra. Nợ cũ, đợt này thêm hai chuỗi nữa |

## Tài liệu lệch

Kiểm lại lúc 19:10 — phần lớn đã được dọn trong lúc audit chạy. Còn đúng hai chỗ:

- [phase-03](../260804-1752-web-chung-cho-team-phan-tan/phase-03-tach-hai-vung-khoa-va-ve-ky.md)
  dòng 13: `Trạng thái: 🟡 đang làm — 5/11 việc`. Mọi chỗ khác (`plan.md`, roadmap, changelog) đã
  là **6/11**.
- [codebase-summary.md](../../docs/codebase-summary.md): dòng 70 ghi "18 model", dòng 95 ghi
  "13 model trong `prisma/schema.prisma`" — bảng mô hình dữ liệu bên dưới cũng chưa có `RelayDevice`
  và 4 model đăng nhập.

---

## Chỗ làm tốt, không cần đụng

- **Kiểm khóa yếu lúc đăng ký.** `assertRelayPublicKeyUsable` thử trao khóa thật thay vì chép bảng
  điểm xấu, và test phủ cả ba nhóm (toàn 0, điểm bậc 8, p−1). Đây là loại lỗ mà phần lớn mã sản
  phẩm bỏ qua.
- **Test đối chiếu vector chuẩn** (RFC 8032 cho Ed25519, RFC 7748 cho X25519) thay vì ký-rồi-tự-kiểm
  — đúng thứ cần, vì cầu nối GĐ4 sẽ được viết độc lập.
- **Thu hồi một chiều ép bằng `@unique` + giữ nguyên hàng**, không xóa. Đăng ký lại khóa đã thu hồi
  bị chặn kèm câu giải thích đúng. Câu thông báo ở cả action lẫn UI đều nói rõ ranh giới "chặn được
  vé mới, không với tới ciphertext đã lấy về" — chỗ dễ hiểu sai nhất, và không chỗ nào nói lướt.
- **Cả hai action đều `adminAction` + ghi `AuditLog` có `actorId`.**

## Câu chưa trả lời

1. Mục 2 (bỏ giá trị mặc định của `encryptCredential`) đụng 12 chỗ gọi — làm ngay trong GĐ3 hay
   xếp vào việc 11 (lượt grep dọn cuối phase)?
2. Dải cảnh báo ở mục 4 nên gộp luôn với dải "cầu nối bản cũ" của QĐ 11 thành một chỗ hiện cảnh
   báo vận hành, hay hai dải riêng?
