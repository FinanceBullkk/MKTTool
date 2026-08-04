# Đưa bộ dò shadowban vào chạy thật

**Ngày:** 04/08/2026 · **Nhánh:** `feat/rut-gon-luong-dang-bai` · **Đợt:** 4

**Trạng thái:** ✅ **Phần code xong 04/08/2026** — GĐ1 (`f34ebf2`), GĐ2 (`62801e2`), GĐ3
(`afb7bb4`). Việc còn lại **không phải code**: mua một proxy quan sát viên rồi chạy lượt dò thật.

## Vì sao có đợt này

Đo trạng thái kho ngày 04/08/2026:

| | |
|---|---|
| Nick Reddit | 2 (đều đang cold-start) |
| Proxy thường | 10, **7 con chưa gắn nick** |
| **Proxy quan sát viên** | **0** |
| **Lượt dò đã chạy** | **0** |

Cả Phase 03 — parser `old.reddit.com`, khóa chống chạy chồng, biểu đồ karma, ảnh chụp màn hình,
luật số 10 — **chưa từng chạy một lần nào**, vì thiếu đúng một thứ: một proxy quan sát viên.

Tệ hơn, trang Hôm nay đang hiện dải *"nick chưa được dò gần đây"* và sẽ hiện **mãi mãi**, vì nó
nói sai nguyên nhân. Vấn đề không phải "chưa dò gần đây" mà là **"không dò được"**. Người đọc dải
đó không có đường nào biết phải làm gì tiếp.

Đây đúng loại lỗi vừa dọn ở [đợt 3](../260804-0321-cong-cu-tu-phat-hien-hong-hoc/plan.md):
cảnh báo không kèm nguyên nhân thật và không kèm đường xử lý. Lần này nó nằm ở chỗ khác.

## Các phase

| # | Phase | Trạng thái |
|---|---|---|
| 01 | [Kiểm proxy quan sát viên](phase-01-kiem-proxy-quan-sat-vien.md) | ✅ Xong 04/08/2026 |
| 02 | [Nút "Dò cả đàn" ngay trong app](phase-02-nut-do-ca-dan-trong-app.md) | ✅ Xong 04/08/2026 |
| 03 | [Cảnh báo nói đúng nguyên nhân](phase-03-canh-bao-noi-dung-nguyen-nhan.md) | ✅ Xong 04/08/2026 |

Làm theo thứ tự: 01 cho phép tin vào proxy quan sát viên trước khi 02 dựa vào nó, và 03 chỉ đúng
khi đã có đường xử lý để trỏ tới.

### Đã kiểm chứng

- `typecheck` + `lint` + **382 test** (thêm 7 test cho hàm quyết định cảnh báo)
- Chạy đúng dòng lệnh mà launcher sinh ra (`node --env-file-if-exists=.env --import tsx
  scripts/run-health-check.ts`) → báo đúng "chưa có proxy quan sát viên" và thoát mã 1
- Hồi quy: kiểm một proxy thật sau khi tách hàm đo khỏi hàm ghi → vẫn ra đúng IP
- `readHealthCheckLockStatus()` trả đúng trạng thái rỗng khi không có lượt nào chạy

### Nghiệm thu thật — 04/08/2026

Proxy quan sát viên: IPRoyal **ISP dedicated**, US, cổng HTTP. Kiểm → Sống. Bấm **Dò cả đàn** →
hai bản ghi `HealthCheck` đầu tiên của dự án. Không nick nào ra "Không dò được".

**Lượt chạy thật bắt được hai lỗi mà 390 test không thấy** — cả hai cùng một kiểu: *đếm sai rồi
kết luận chắc nịch*.

| Lỗi | Biểu hiện | Sửa |
|---|---|---|
| 404 → khẳng định "shadowban toàn cục" | Cách ly nhầm một nick đang khỏe, vì username trong kho là nhãn tự đặt | Câu chữ nói đúng thứ đo được + dùng lịch sử dò làm bằng chứng |
| Mẫu số đếm job, không đếm bài | Hai job dán trùng một link → "1/2" trong khi thật là 1/1 | Đếm URL khác nhau, dùng lại `normalizeThreadUrl()` của luật 8 |

Lỗi thứ hai đáng sợ hơn vì im lặng: nó chỉ sai một đơn vị, vừa đủ đứng sát ngưỡng cảnh báo mà
không vượt. Thêm một job trùng nữa là nick sạch bị báo **Nghi ngờ**.

Bài học ghi lại: **hai lỗi này chỉ hiện ra khi gặp dữ liệu thật.** Test bao nhiêu cũng không
thay được một lượt chạy với nick thật, proxy thật, dữ liệu người dùng tự nhập.

## Việc của người, không phải của code

Sau khi xong, bạn vẫn phải **khai một proxy quan sát viên** ở `/proxies`. Bảy proxy đang rảnh dùng
được, nhưng nhớ hai điều kiện của README:

- **HTTP**, không phải SOCKS5 — Chromium không xác thực được với SOCKS5, nó bỏ qua user/mật khẩu
  rồi đi tiếp, hoặc hỏng, hoặc tệ hơn là chạy bằng IP nhà mà không ai biết.
- **Chưa từng và sẽ không bao giờ đăng nhập nick nào** bằng IP đó. Proxy rảnh chưa gắn nick thì
  thỏa điều kiện này.

## Kiểm chứng chung

`typecheck` + `lint` + `test` xanh. Không chạy `npm run build` (máy ít RAM trống).
Nghiệm thu thật: khai một proxy quan sát viên → bấm Kiểm → bấm Dò cả đàn → có bản ghi
`HealthCheck` đầu tiên trong đời dự án.
