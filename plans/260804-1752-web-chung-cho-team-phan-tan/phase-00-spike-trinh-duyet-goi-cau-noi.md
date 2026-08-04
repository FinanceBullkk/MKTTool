# Phase 00 — Spike: trình duyệt gọi xuống cầu nối

## Context

- [plan.md](plan.md) — quyết định 3, 5, 6
- [multizen-mcp-client.ts](../../src/lib/antidetect/multizen-mcp-client.ts) — thứ cầu nối sẽ gọi

## Overview

**Ưu tiên:** CAO NHẤT — chặn đường | **Trạng thái:** ✅ **XONG 04/08/2026** | **Dự kiến:** 0.5 ngày

> **Kết quả: cả hai câu đều CÓ.** Đường gọi ngầm dùng được, kèm 3 ràng buộc bắt buộc —
> xem [báo cáo](../reports/spike-260804-1835-trinh-duyet-goi-cau-noi.md) và
> [plan.md § Kết quả GĐ0](plan.md#kết-quả-gđ0-đo-04082026--ba-ràng-buộc-bắt-buộc-cho-gđ234).
> Thiết kế GĐ2/3/4 **giữ nguyên**, không phải đổi sang đường tab nhỏ toàn bộ.

Xác nhận bằng code chạy thật, không bằng suy đoán: một trang HTTPS **có gọi được** xuống
`http://127.0.0.1:<cổng>` trên Chrome/Edge hiện tại không, và Bun **có đóng gói được** file
`.exe` chạy trên Windows không cài Node không.

Làm trước tiên vì kết quả có thể đổi thiết kế giao diện của Phase 02/03: trượt thì **mọi**
thao tác chạm cầu nối phải đi đường tab nhỏ, không chỉ riêng phần bí mật.

## Key Insights

- Trình duyệt coi `http://127.0.0.1` là nguồn tin cậy nên **không chặn vì lý do mixed content** —
  rào cản thật nằm ở CORS và ở luật gọi vào mạng nội bộ (Private Network Access), cả hai đều
  do phía nhận trả lời, mà phía nhận là code của mình.
- Chrome còn đang siết dần luật này. Chạy được hôm nay không bảo đảm chạy được mãi → đây là lý do
  quyết định 3 chỉ giao **thao tác không mang bí mật** cho đường gọi ngầm.

**Đo xong rồi thì phần dự đoán trên sai một nửa** (ghi lại để lần sau đừng đoán nữa):

- CORS **không** phải rào cản. Máy chủ thử trả đủ header, preflight qua sạch.
- Luật đang chặn là **Local Network Access**, đời sau của Private Network Access, và nó
  **không hỏi máy chủ nữa** — nó hỏi *người dùng*. Header trả khéo tới đâu cũng vô ích.
- Nó chỉ hiện hộp xin quyền khi trang **đang có kích hoạt người dùng**. Không có cú bấm thì
  request **treo im lặng**: không lỗi, không hộp, console trắng trơn, máy chủ không thấy gì.
- Câu "Chrome còn đang siết dần" thì đúng, và đã siết tới nơi rồi.

## Requirements

1. Trang phục vụ qua HTTPS thật (không phải `localhost`) gọi được `fetch` xuống cầu nối, gồm cả
   preflight, trên **Chrome và Edge** bản hiện tại
2. `.exe` sinh bởi Bun chạy trên Windows sạch (không cài Node), gọi được MultiZen MCP `:7777`
3. Kết quả ghi thành báo cáo, kèm phiên bản trình duyệt đã đo

## Architecture

```
trang HTTPS tạm  ──fetch──►  cầu nối thử (127.0.0.1:PORT)  ──MCP──►  MultiZen :7777
   (Railway hoặc                 · Access-Control-Allow-Origin
    tunnel tạm)                  · trả lời preflight mạng nội bộ
```

## Related Code Files

**Tạo (tạm, xóa sau spike):** `spike/relay-probe/` — máy chủ HTTP nhỏ + trang thử
**Đọc tham khảo:** [multizen-mcp-client.ts](../../src/lib/antidetect/multizen-mcp-client.ts)
**Không sửa gì trong `src/`**

## Implementation Steps

1. Viết máy chủ HTTP nhỏ nghe `127.0.0.1`, một endpoint `GET /ping` trả `{ok:true}`
2. Trả đủ header CORS cho nguồn HTTPS đã chọn, và **trả lời đúng preflight của luật mạng nội bộ**
3. Đưa một trang tĩnh lên HTTPS thật; trang gọi `fetch` xuống `/ping`
4. Đo trên Chrome và Edge. Ghi lại phiên bản, và ghi nguyên văn lỗi nếu chặn
5. `bun build --compile` ra `.exe`. Chạy trên máy Windows **không cài Node**
6. Từ `.exe` đó gọi thật MultiZen MCP `:7777` (dùng lại logic của `multizen-mcp-client.ts`)
7. Viết báo cáo `plans/reports/spike-<ngày>-trinh-duyet-goi-cau-noi.md`

## Todo List

- [x] Máy chủ thử nghe `127.0.0.1`, có CORS + trả lời preflight mạng nội bộ
- [x] Trang thử trên HTTPS thật — dùng `https://example.com`, không phải dựng trang riêng
- [x] Đo Chrome — **150.0.7871.188**, chặn bởi Local Network Access; có cú bấm + Cho phép → 200
- [x] Đo Edge — **151.0.4129.59**, y hệt Chrome (quyền `"prompt"`, bắn tự động thì treo)
- [x] ~~`bun build --compile`~~ → **Node SEA** (Bun không cài; quyết định 6 không chốt phải là Bun)
- [x] Chạy `.exe` với `PATH` cắt sạch `node` — chạy được, `isSea()` = `true`.
      ⚠️ **chưa** thử trên máy Windows thứ hai, chỉ có một máy
- [x] `.exe` gọi được MultiZen MCP — `initialize` + `tools/list` 22 tool + `list_profiles` trả dữ liệu thật
- [x] Báo cáo + chốt: **đường gọi ngầm DÙNG ĐƯỢC**, kèm 3 ràng buộc
- [x] Xóa thư mục `spike/`
- [x] *(bổ sung)* Quyền **giữ qua lần khởi động sau**, và cấp rồi thì **hết cần cú bấm**
- [x] *(bổ sung)* Có policy `LocalNetworkAccessAllowedForUrls` cấp sẵn quyền — Chrome 139+, Edge cũng có

## Success Criteria

Trả lời được **hai câu bằng có/không kèm bằng chứng**:

1. Trang HTTPS gọi được xuống `127.0.0.1` trên Chrome và Edge?
2. Bun ra được `.exe` chạy trên Windows sạch và nói chuyện được với MultiZen?

Câu 1 = **không** → đánh dấu trong plan.md: mọi thao tác đi đường tab nhỏ, Phase 02/03/04 thiết kế
theo hướng đó.
Câu 2 = **không** → lùi về Node SEA, đo lại bước 5-6.

**Đã trả lời 04/08/2026: câu 1 = CÓ (có điều kiện), câu 2 = CÓ (bằng Node SEA).**
Phase 02/03/04 giữ hướng cũ, thêm 3 ràng buộc ở [plan.md](plan.md).

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Luật trình duyệt đổi sau khi đã xây xong | Bí mật vốn đã đi đường tab nhỏ (quyết định 3) → hỏng thì mất mượt, không mất an toàn |
| Bun trục trặc trên Windows | Lùi Node SEA. Không đổi ngôn ngữ (quyết định 6) |
| Đo trên máy dev rồi kết luận cho cả team | Bắt buộc đo ít nhất một máy Windows khác, không cài Node |

## Security Considerations

- Máy chủ thử **không đụng credential thật**, không nối database
- `Access-Control-Allow-Origin` khai đúng một nguồn, **không dùng `*`** — kể cả trong spike, để
  không ai chép nhầm cấu hình lỏng sang bản thật
- Xóa `spike/` sau khi xong, không để lại code nghe cổng cục bộ trong repo

## Next Steps

Xong → [Phase 01](phase-01-postgres-va-mui-gio-team.md). Kết quả spike ghi ngược vào plan.md.
