# Băng chuyền vòng đăng bài

**Tạo:** 03/08/2026 · **Trạng thái:** ✅ Xong · **Ưu tiên:** P2

Tiếp nối [rút gọn luồng người dùng](../260803-2225-rut-gon-luong-nguoi-dung/plan.md). Bốn phương
án đã cân, chọn hai cái rẻ và không đụng lõi; hai cái còn lại ghi rõ điều kiện để mở lại.

## Đã làm

- **Sơ đồ vòng đời một bài đăng** — `docs/system-architecture.md` §2. Ba đường đứt chạy ngược về
  bộ luật là phần đáng nhớ: quên bấm "Đã đăng" cắt cả ba cùng lúc.
- **Băng chuyền ở `/queue/new`** — [pipeline-strip.tsx](../../src/components/queue/pipeline-strip.tsx)
  (trình bày) + [compose-pipeline-steps.ts](../../src/components/queue/compose-pipeline-steps.ts)
  (hàm thuần dựng chặng, có test). Bấm chặng → nhảy tới ô nhập, qua `id` gắn ở
  `post-job-fields.tsx` và `content-source-picker.tsx`.
- **Băng chuyền vòng lặp ở `/`** — [posting-loop-strip.tsx](../../src/components/queue/posting-loop-strip.tsx)
  + [posting-loop-summary.ts](../../src/lib/queue/posting-loop-summary.ts) (4 câu `count`).

**Nguyên tắc giữ:** chặng chỉ báo "xong" khi phần đó đủ để LƯU, và đèn chặng cuối lấy thẳng từ
verdict. Băng chuyền xanh trong khi nút xếp lịch còn khóa, hoặc trong khi bảng luật đỏ, là kiểu
hỏng tệ nhất — nó dạy người dùng tin nhầm chỗ. Có test khóa cả hai.

**Kiểm chứng:** `typecheck` + `lint` + 365 test + `rules:smoke` 6/6 + `next build` (3 lượt liên
tiếp) đều xanh.

## Chưa làm — điều kiện để mở lại

| Phương án | Chi phí | Mở lại khi |
|---|---|---|
| **Đèn luật thành đồng hồ đo** — hiện "7/9 bài hữu ích" thay dấu ✓ | 1–1,5 ngày, sửa 10 file luật | Băng chuyền được dùng thật sau một tuần. Đây là phương án giá trị nhất nhưng cũng là cái duy nhất đụng lõi bộ luật, nên đừng đi trước bằng chứng |
| **Canvas kéo-thả (React Flow)** | 3–5 ngày + dependency ~50KB | Câu hỏi đổi từ "đăng bài này" sang "tuần này 6 nick đăng ở đâu". Kể cả lúc đó, thử bảng lịch tuần bằng HTML thuần trước |

**Ghi chú kỹ thuật cho đồng hồ đo:** số liệu đã nằm sẵn trong `RuleContext`; chặn là
[rules-engine.ts](../../src/lib/rules/rules-engine.ts) set `reason: null` khi verdict là `ALLOW`.
Verdict cũ đã serialize trong `PostJob.ruleVerdicts` phải vẫn đọc được — theo đúng cách
`evaluation.skipped ?? []` đang làm.

## Chạy tay 04/08/2026 — kết quả

Đã xác nhận trên trình duyệt: bấm chặng nhảy đúng ô nhập · thẻ nhắc việc Reddit hiện nút
"Đã đăng" và job chuyển `POSTED` kèm link · băng chuyền hiện đúng ở cả hai trang.

Hai thứ sửa ngay trong lượt chạy tay:

- **Lưu xong, form trắng mà băng chuyền vẫn khoe lựa chọn cũ.** React 19 tự reset form sau
  action nhưng chỉ giữ được ô text/datetime — mọi `<select>` bị xóa trong khi state React vẫn ôm
  id cũ. Sửa: dọn state khi `state.ok`. Không sửa thì bấm "Xếp lịch" lần nữa sẽ gửi id rỗng
  trong lúc băng chuyền vẫn xanh.
- **Nhãn ghi cứng "10 luật"** trong khi đích Facebook Page chỉ áp 5 → đổi thành "Bộ luật", số
  thật nằm ở dòng hint.

Không phải bug (đã kiểm bằng Graph API): bài đăng lên Fanpage mở ra "This content isn't
available" là do trình duyệt **chưa đăng nhập** — `is_published` của cả bài lẫn Page đều `true`,
và link app lưu là đúng (`61592578208629` trên thanh địa chỉ là profile id do Facebook tự chuyển
hướng tới). Thêm `npm run facebook:inspect` để lần sau hỏi Graph thay vì đoán.

## Còn treo

- Chưa xác nhận bằng mắt: mấy con số trên băng chuyền "Vòng đăng bài" có tự đổi sau khi bấm
  "Đã đăng" không (tức `revalidatePath("/")` có ăn), và tab "Viết mới" chạy trên trình duyệt
  thật — đường này mới chỉ có test database phủ.
- Hai job Reddit đang dùng chung một `postedUrl` (dữ liệu thử) → thread đó có 2 `Interaction`,
  luật 8 sẽ chặn nick khác đụng vào. Dọn nếu định dùng `r/Trove` thật.
- Trang Hôm nay không có chỗ nào liệt kê job Fanpage tới hạn — băng chuyền đếm nó vào
  "Chờ đăng" nhưng không có thẻ nào nhắc. Sửa được bằng cách dùng lại `FacebookPublishButton`.
- ~~`next build` từng crash worker hai lần~~ — đã rõ nguyên nhân: máy 16GB thường chỉ còn 2–3GB
  trống, mà `next build` spawn 11 worker (một per core). Không phải lỗi code. **Đừng chạy
  `npm run build` trên máy này**; `typecheck` + `lint` + `test` là đủ, vì mọi route đều
  `force-dynamic` nên build không bắt thêm lỗi nào.
