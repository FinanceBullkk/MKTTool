# Phase 02 — Nút "Dò cả đàn" ngay trong app

**Trạng thái:** ✅ Xong 04/08/2026 (`62801e2`) · [← plan](plan.md)

## Vấn đề

Trang Hôm nay cảnh báo *"N nick chưa được dò gần đây"* nhưng bấm vào chỉ sang bảng — **không có
nút nào chạy cả đàn**. `health-check-now-button.tsx` chỉ dò một nick. Muốn dò hết thì mở terminal
gõ `npm run health`.

Cảnh báo không kèm đường xử lý là cảnh báo bị học cách phớt lờ.

## Vì sao chưa làm được bằng cách thường

`api/health/run/route.ts` **cố ý** từ chối dò cả đàn, và lý do vẫn đúng nguyên:

> *Dò cả đàn phải nghỉ 30-90 giây giữa các nick, nên một lượt đầy đủ mất gần mười phút — dài hơn
> mọi giới hạn chờ hợp lý của một request HTTP.*

Nên không thể chỉ nới `maxDuration` lên. Phải đổi hình dạng của việc: từ *chờ xong rồi trả lời*
sang *khởi động rồi báo đang chạy*.

## Cách làm: chạy ở tiến trình riêng, đọc trạng thái qua file khóa

Bấm nút = **sinh đúng tiến trình mà `npm run health` vẫn chạy**, ở chế độ tách rời, rồi trả lời
ngay. Không viết lại logic dò lần thứ hai.

Kiến trúc sẵn có ủng hộ cách này — chú thích trong `health-check-lock.ts` đã ghi rõ vì sao khóa
là **file** chứ không phải biến trong bộ nhớ:

> *`npm run health` chạy ở tiến trình RIÊNG, không phải trong web app.*

Tức là file khóa vốn đã được thiết kế để hai tiến trình nhìn thấy nhau. Giờ chỉ cần **đọc** nó:

- Có khóa còn hạn → "đang dò, bắt đầu N phút trước"
- Không có khóa → "không có lượt nào đang chạy"

Kết quả từng nick ghi thẳng vào database ngay khi dò xong, nên bảng sức khỏe **tự đầy dần** theo
lượt chạy. Không cần kênh truyền tiến độ riêng.

## File

**Tạo**
- `src/lib/health/health-check-process-launcher.ts` — sinh tiến trình tách rời
- `src/lib/health/health-check-run-actions.ts` — server action: khởi động một lượt
- `src/components/health/herd-health-check-controls.tsx` — nút + hiện trạng thái lượt đang chạy

**Sửa**
- `src/lib/health/health-check-lock.ts` — thêm hàm **đọc** trạng thái khóa (hiện chỉ có giành/thả)
- `src/app/health/page.tsx` — gắn nút và khối trạng thái

## Các bước

1. `readHealthCheckLockStatus()` trong `health-check-lock.ts`: trả `{ running, pid, startedAt,
   minutesElapsed }`. Khóa quá `STALE_AFTER_MS` thì coi như **không chạy** — dùng đúng ngưỡng đã
   có, đừng đặt ngưỡng thứ hai.
2. Launcher sinh tiến trình bằng `process.execPath` với `--env-file=.env --import tsx`, trỏ vào
   `scripts/run-health-check.ts`, `detached: true`, `stdio: "ignore"`, rồi `unref()`.
3. Server action: đọc khóa trước — đang chạy thì **không sinh thêm tiến trình**, trả lời "đang
   chạy rồi". Chưa có proxy quan sát viên thì nói thẳng thay vì sinh một tiến trình chắc chắn chết.
4. Nút + khối trạng thái ở `/health`, kèm câu nhắc lượt đầy đủ mất gần mười phút.

## Xong là khi

- Bấm "Dò cả đàn" → trả lời ngay, không treo trình duyệt.
- Đang có lượt chạy thì nút nói rõ và không sinh lượt thứ hai.
- Tải lại `/health` giữa chừng thấy bảng đầy dần.
- `npm run health` trong terminal vẫn chạy y như cũ — không đụng vào nó.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Sinh tiến trình hỏng im lặng (`stdio: ignore` nuốt hết lỗi) | Đọc khóa sau vài giây: không thấy khóa nghĩa là tiến trình chết ngay. Câu chữ phải nói ra được điều đó |
| `--import tsx` không có ở máy khác | `tsx` là devDependency đã cài sẵn; đây là công cụ chạy trên máy cá nhân, không phải bản triển khai |
| Hai tiến trình cùng lúc | Đã có `acquireHealthCheckLock` chặn ở tầng dưới; kiểm khóa trước chỉ để câu thông báo dễ hiểu hơn |
| Người dùng bấm rồi đóng trình duyệt | Không sao — tiến trình tách rời, không phụ thuộc request |
