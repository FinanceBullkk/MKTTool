# Rà soát toàn bộ codebase — 03/08/2026

**Phạm vi:** toàn bộ `src/` (124 file TS/TSX), `scripts/`, `prisma/`. Branch `master`, commit `6c92890`.
**Cách làm:** chạy typecheck + test + lint + build, rồi đọc tay các đường bảo mật và logic lõi.

## Kiểm tra tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | ✅ sạch |
| `npm test` | ✅ 247/247 test xanh, 22 file test |
| `npm run lint` | ✅ 0 lỗi, 4 cảnh báo (đều `react-hooks/set-state-in-effect`) |
| `npm run build` | ✅ 19 route, biên dịch 4.0s |
| `npx prisma migrate status` | ✅ 4 migration, DB khớp schema |

## Bảo mật — đã đối chiếu, không thấy lỗ

- **AES-256-GCM** (`credential-encryption.ts`): IV 12 byte sinh mới mỗi lần, auth tag kiểm độ dài,
  tiền tố phiên bản `v1`. Sai khóa và dữ liệu bị sửa trả cùng một thông báo — không có oracle.
- **Khóa** chỉ đọc từ `process.env.VAULT_KEY`, có kiểm độ dài + charset hex, cache trong RAM.
- **Origin guard**: cả 2 route `POST` (`launch`, `rules/preview`) đều gọi `isSameOrigin`. Dùng header
  `Host` chứ không dùng `request.url` — đúng, vì Next chuẩn hóa `request.url` về `localhost:3000`.
- **OAuth Facebook**: `state` 24 byte ngẫu nhiên, cookie `httpOnly` + `sameSite=lax` + TTL 600s,
  xóa sau một lần dùng kể cả khi hỏng. Đối chiếu trước khi đổi `code`.
- **Che token**: `redactTokens()` chạy trong constructor `FacebookGraphError` — mọi đường lỗi Graph
  đều đi qua, không phụ thuộc chỗ gọi nhớ gọi. Token đi trong header `Authorization`, không trong query.
- **SQL thô**: chỉ 1 chỗ (`database-backup.ts:45` `VACUUM INTO`). Đường dẫn dựng từ mốc thời gian,
  không có đầu vào người dùng, có nhân đôi dấu nháy đơn. An toàn.
- Không có `dangerouslySetInnerHTML`, `eval`, `$queryRaw`, `as any`, `@ts-ignore`, `TODO`/`FIXME`.
- `.env` chưa từng vào git; `.env.example` toàn giá trị rỗng.

## Chất lượng — đạt

- 124 file nguồn, chỉ file test vượt 200 dòng. `multizen-adapter.ts` 201 dòng (sát ngưỡng, chấp nhận).
- Mỗi luật một file thuần hàm; toàn bộ truy vấn DB gom ở `rule-context-queries.ts`.
- Ngày/giờ: `endOfLocalDay` trả nửa đêm hôm sau, bộ lọc dùng `< dayEnd` — biên đúng, không đếm sót
  hay đếm trùng. `localDayKey` có năm.
- Bộ luật không dừng ở luật chặn đầu tiên; luật bị bỏ qua được liệt kê riêng trong `skipped`.

---

## Phát hiện — đã sửa hết trong cùng phiên

Sau khi sửa: typecheck sạch, **252/252 test xanh** (thêm 5 test mới), build sạch, lint còn
3 cảnh báo đều đúng chủ ý.

### 1. [CAO] `localhost` vs `127.0.0.1` sẽ làm hỏng OAuth Facebook — ✅ đã sửa

`facebook-app-config.ts:19` mặc định redirect URI là `http://localhost:3000/...`, nhưng app bind
cứng `-H 127.0.0.1` và chú thích trong `same-origin-guard.ts:19` ghi rõ đã đo thật ở
`http://127.0.0.1:3000`. Hai địa chỉ này đang cùng lưu hành trong dự án.

Nếu bạn MKT mở app bằng `http://127.0.0.1:3000` rồi bấm **Kết nối nick Facebook**:

1. `/api/facebook/oauth/start` đặt cookie `state` cho host `127.0.0.1`.
2. Facebook chuyển hướng về `http://localhost:3000/api/facebook/oauth/callback`.
3. Trình duyệt coi `localhost` và `127.0.0.1` là **hai host khác nhau** với cookie → không gửi cookie.
4. Callback: `expectedState` rỗng → luôn báo *"Chuỗi state không khớp"*.

Thông báo đó chỉ về đúng chỗ sai (CSRF) trong khi nguyên nhân thật là địa chỉ. Lỗi sẽ nổ đúng lúc
làm bước cuối Phase 04, và mất thời gian mò vì nó trông như lỗi bảo mật.

**Đã sửa** (`7e9023b`): thêm `facebook-redirect-host-guard.ts` — đối chiếu header `Host` với host của
`FACEBOOK_REDIRECT_URI` ngay ở bước mở luồng, lệch thì dừng **trước khi đặt cookie** và nói rõ phải
sửa gì. Chốt `localhost:3000` làm chuẩn cả dự án (Meta chỉ cho `http://` với `localhost`); README và
`.env.example` ghi rõ điều đó. Trang lỗi cũng dựng địa chỉ từ header `Host` thay vì `request.url`, để
không ném người dùng sang chính địa chỉ khác mà lớp chặn này sinh ra để dập.

**Kiểm chứng chạy thật** trên dev server (03/08/2026):

| Header `Host` gửi lên | Kết quả |
|---|---|
| `127.0.0.1:3000` | 307 về `127.0.0.1:3000/facebook?error=…` kèm câu chỉ rõ phải sửa gì. **Không có `set-cookie`** — dừng trước khi đặt state |
| `localhost:3000` | Qua guard, đi tiếp và dừng ở "Chưa cấu hình Meta App" — đúng trạng thái hiện tại |

### 2. [THẤP] 4 cảnh báo lint — 3 cái đúng chủ ý, 1 cái nên dọn — ✅ đã dọn

Cả 4 đều là `react-hooks/set-state-in-effect`. Ba cái đầu là mẫu đúng và không sửa được cho sạch hơn:

- `account-vault-actions-panel.tsx:38` — đếm ngược OTP, xóa mã khi hết giờ.
- `post-job-composer.tsx:53` — đặt giờ mặc định sau khi mount để không vỡ hydrate.
- `use-rule-preview.ts:31` — trả về `idle` khi lựa chọn chưa đủ.

Cái thứ tư đáng dọn: `post-job-composer.tsx:63-65` reset `targetId` trong effect. Có một lượt render
mà `targetId` đã không hợp lệ nhưng chưa bị xóa, nên `useRulePreview` bắn một lời gọi
`/api/rules/preview` với cặp nick/đích lệch nền tảng. Request đó bị abort ngay sau, nên vô hại về
kết quả — nhưng vẫn là công vô ích và là mẫu dễ sinh bug về sau. Sửa bằng cách suy ra thay vì reset:

```ts
const effectiveTargetId = targetStillValid ? targetId : "";
```

**Đã sửa** (`18da23e`): bỏ được cả `useEffect` lẫn cảnh báo.

### 3. [RẤT THẤP] `scripts/import-proxies-from-provider-list.ts` không có trong `package.json` — ✅ đã thêm

**Đã sửa** (`2958e28`): thêm `npm run proxies:import`, ghi vào bảng lệnh của README.

### 4. Thay đổi chưa commit — ✅ đã commit

`src/app/layout.tsx` thêm `suppressHydrationWarning` vào `<body>` cho extension trình duyệt.
Đúng và đúng chỗ (chỉ `<body>`, không lan xuống cây con). Commit `77f7641`.

---

## Câu hỏi chưa giải

Không còn. Địa chỉ chuẩn đã chốt là `localhost:3000`; nếu sau này đưa app ra địa chỉ khác thì
phải sửa `FACEBOOK_REDIRECT_URI` **và** khai lại đúng chuỗi đó trong Meta App — guard mới sẽ
nhắc ngay nếu quên.
