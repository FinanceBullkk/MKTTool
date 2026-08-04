# Quy ước viết code

**Cập nhật:** 03/08/2026

Quy ước đã dùng thật trong repo này, không phải mong muốn. Sửa code theo tài liệu này thì phần
sau khớp phần trước. Kiến trúc tổng thể ở [system-architecture.md](system-architecture.md),
bản đồ file ở [codebase-summary.md](codebase-summary.md).

---

## 1. Ngôn ngữ

**Tiếng Việt: giao diện, thông báo lỗi, chú thích, tài liệu, commit message.**
**Tiếng Anh: tên biến, tên hàm, tên file, giá trị enum trong database.**

Người dùng công cụ này là bạn MKT người Việt, và thông báo lỗi là thứ họ đọc lúc đang bối rối
nhất. `"Proxy này đã gắn cho nick khác"` hữu ích hơn `"Unique constraint failed"`.

## 2. File

- **kebab-case**, tên dài mô tả đúng việc: `facebook-token-health.ts`, không phải `fbHealth.ts`.
  Tên dài để tìm bằng Grep ra ngay, không phải mở file mới biết nó làm gì.
- **Dưới 200 dòng.** Vượt thì tách theo ranh giới nghiệp vụ, không tách cho đủ chỉ tiêu.
- **Một khái niệm một file.** Mỗi luật an toàn một file (`rule-daily-cap.ts`), mỗi adapter một
  file. Kiểu dùng chung ở file riêng (`action-result.ts`) chứ không nằm nhờ file khác — import
  từ file không liên quan là một câu đánh lạc hướng cho người đọc sau.

## 3. Server action

Mọi server action trả về `ActionResult { ok: boolean; message: string }` (`lib/actions/action-result.ts`).
`message` là câu tiếng Việt hiện thẳng cho người dùng: **nói điều gì đã xảy ra và làm gì tiếp
theo**, không phải mã lỗi kỹ thuật.

Đặt tên theo động từ + đối tượng: `createAccount`, `publishJobToPage`, `markJobPosted`.
Nhóm theo nghiệp vụ trong `lib/<miền>/`, không gom hết vào một file `actions.ts`.

## 4. Hàm thuần ở chỗ có quyết định

Chỗ nào có logic đáng để test thì tách thành hàm thuần, không lẫn với I/O:

| Hàm thuần | Lớp có I/O bọc ngoài |
|---|---|
| `rule-*.ts` — mỗi luật `(ctx) => verdict` | `rule-context-builder.ts` hỏi database |
| `reddit-profile-parser.ts` đọc HTML | `reddit-shadowban-prober.ts` mở trình duyệt |
| `facebook-token-health.ts`, `facebook-post-payload.ts` | `facebook-graph-client.ts` gọi mạng |

Nhờ vậy phần lớn test không cần database, không cần mạng, không cần token thật.

## 5. Test

| Đuôi file | Nghĩa | Ghi chú |
|---|---|---|
| `*.test.ts` | Không chạm database | Chạy nhanh, chạy được ở mọi nơi |
| `*.database.test.ts` | Chạm Postgres thật | Dùng chung database `TEST_DATABASE_URL`, mỗi file `deleteMany()` trước |

`fileParallelism: false` — cố ý. Các file database dùng chung một database; chạy song song sẽ đỏ
ngẫu nhiên, và cái đắt nhất không phải vài giây mà là việc nó dạy người đọc quen "chạy lại là xanh".

`TEST_DATABASE_URL` **bắt buộc** và phải trỏ vào database tên kết thúc bằng `_test` —
`vitest.global-setup.ts` `DROP SCHEMA` không hỏi lại trước mỗi lượt chạy, nên `assertIsTestDatabase()`
từ chối mọi tên khác. Cố ý không có giá trị mặc định: một mặc định kiểu `localhost/mkttool_test`
trên máy người khác sẽ âm thầm trỏ vào chỗ họ không ngờ tới.

**Không mock thứ đang cần kiểm chứng.** Bộ dò Reddit có `npm run health:smoke` đối chiếu HTML
Reddit thật — chính nó bắt được 2 lỗi parser mà test mock đã cho qua.

**Mỗi giai đoạn có một smoke test** chạy được không cần nick thật: `vault:smoke`, `rules:smoke`,
`health:smoke`, `facebook:smoke`. Thêm tính năng lớn thì thêm vào đó.

## 6. Chú thích

Chú thích trả lời **"vì sao"**, không kể lại code đang làm gì. Ưu tiên giải thích:

- vì sao thứ tự các bước không đảo được (đẩy proxy **trước** khi mở profile),
- vì sao một ngưỡng là con số đó (Jaccard 0.70),
- vì sao một đường thất bại phải dừng hẳn thay vì cảnh báo,
- vì sao đã **không** chọn cách hiển nhiên hơn.

Kiến thức nghiệp vụ đứng sau ngưỡng số thì ghi ở [domain-glossary.md](domain-glossary.md), trong
code chỉ trỏ tới.

## 7. Ràng buộc và lỗi

- **Ràng buộc nghiệp vụ ép ở database** (`@unique`, `@@unique`), không chỉ ép ở UI.
- **Không nuốt lỗi.** Giải mã hỏng, đẩy proxy hỏng, parser hỏng — đều báo và dừng. Kết luận
  "không biết" phải khác kết luận "ổn": bộ dò không đọc được HTML thì trả `ERROR`, không bao giờ
  trả `HEALTHY`.
- **Xóa bị chặn khi còn tham chiếu** (`reference-guard.ts`), kèm câu nói rõ vướng gì.
- **Che bí mật trong mọi thông báo lỗi** — API bên ngoài hay vọng lại nguyên tham số đã gửi.
  Thêm cột `*Enc` mới thì khai vào `encrypted-field-registry.ts`, nếu không `vault:rekey` sẽ bỏ sót.
  Cột mới phải mang dấu `// vault:server` hoặc `// vault:operator` trong `schema.prisma` và khai
  đúng vùng đó ở registry — vùng khóa là quyết định phải nghĩ cho từng cột, test bắt nếu bỏ trống.
  Lúc mã hóa: mặc định của `encryptCredential` là khóa vùng `server`, nên cột vùng `operator`
  **phải** truyền `loadVaultKey("operator")` vào. Sai khóa thì dữ liệu ghi ra không ai mở lại được.

## 8. Trước khi commit

```bash
npm run lint        # phải sạch tuyệt đối: 0 lỗi, 0 cảnh báo
npm run typecheck
npm test
npm run build
```

Đúng bốn lệnh này chạy trong [CI](../.github/workflows/ci.yml) trên mọi push và pull request.
Chạy trước ở máy thì không phải đợi CI báo đỏ.

**Không bao giờ commit:** `.env`, file trong `data/` (nhất là `data/backups/` — bản `pg_dump`
chứa toàn bộ ciphertext), khóa, token, mật khẩu.
`.gitignore` đã chặn sẵn — đừng dùng `git add -f` để lách.

## 9. Commit message

Conventional commits, phần mô tả bằng tiếng Việt, nói **kết quả** chứ không nói **thao tác**:

```
feat(health): tự dọn ảnh chụp cũ hơn 30 ngày ở cuối mỗi lượt dò
fix(facebook): không đẩy job về FAILED sau khi bài đã lên tường
```

Scope theo miền nghiệp vụ: `vault`, `rules`, `queue`, `health`, `facebook`, `antidetect`, `db`,
`security`, `ui`, `scripts`.

## 10. Đổi database

1. Sửa `prisma/schema.prisma`
2. `npm run db:migrate` — sinh migration (lệnh của người phát triển)
3. Commit **cả** file migration lẫn schema

Người nhận bản mới chạy `npm run db:upgrade` (sao lưu trước rồi mới áp), **không** chạy
`db:migrate` — lệnh đó có thể đề nghị dựng lại database từ đầu, tức xóa sạch kho danh tính.

## 11. Cập nhật tài liệu cùng lúc với code

| Đổi gì | Cập nhật file nào |
|---|---|
| Thêm/sửa file trong `src/` | [codebase-summary.md](codebase-summary.md) |
| Thêm khái niệm nghiệp vụ, đổi ngưỡng luật | [domain-glossary.md](domain-glossary.md) |
| Xong một giai đoạn, đổi trạng thái | [development-roadmap.md](development-roadmap.md) + file phase tương ứng |
| Đổi hành vi người dùng thấy được | [../README.md](../README.md) + [project-changelog.md](project-changelog.md) |
| Đổi phạm vi, thêm/bỏ điều "không làm" | [project-overview-pdr.md](project-overview-pdr.md) |

Tài liệu lệch code còn tệ hơn không có tài liệu: nó khiến người đọc tin vào thứ đã sai.
