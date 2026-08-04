# Prompt khởi động Phase 00 ở session khác

Chép nguyên khối dưới đây vào session mới.

---

```
Thực hiện PHASE 00 của kế hoạch "Web chung cho team phân tán" trong repo E:\MKTTool.

## Đọc trước khi làm bất cứ gì

1. plans/260804-1752-web-chung-cho-team-phan-tan/plan.md — nắm 9 quyết định kiến trúc
2. plans/260804-1752-web-chung-cho-team-phan-tan/phase-00-spike-trinh-duyet-goi-cau-noi.md — việc cụ thể
3. README.md — bối cảnh sản phẩm

## Đây là SPIKE, không phải làm tính năng

Mục tiêu duy nhất: trả lời hai câu bằng bằng chứng đo được, không phải bằng suy luận.

**Câu 1 — Một trang phục vụ qua HTTPS có gọi được `fetch` xuống `http://127.0.0.1:<cổng>` không,
trên Chrome và Edge bản hiện tại?**
Gồm cả preflight. Trình duyệt coi `127.0.0.1` là nguồn tin cậy nên không chặn vì mixed content —
rào cản thật nằm ở CORS và ở luật gọi vào mạng nội bộ (Private Network Access). Cả hai đều do
phía nhận trả lời, mà phía nhận là code mình viết trong spike này.

**Câu 2 — Đóng gói được TypeScript thành một file .exe chạy trên Windows không cài Node không,
và file đó gọi được MultiZen MCP không?**

Kết quả quyết định thiết kế giao diện của Phase 02/03/04:
- Câu 1 = CÓ → mở profile đi đường gọi ngầm (mượt), bí mật vẫn đi đường tab nhỏ
- Câu 1 = KHÔNG → mọi thao tác đi đường tab nhỏ; ghi ngược vào plan.md

## Cách đo câu 1

Nhanh nhất trước: viết máy chủ HTTP nhỏ nghe 127.0.0.1 (một endpoint GET /ping trả {ok:true}),
trả đủ header CORS và trả lời đúng preflight của luật mạng nội bộ. Rồi mở BẤT KỲ trang HTTPS nào,
bật devtools console, chạy fetch xuống /ping. Đo trên cả Chrome và Edge, ghi lại phiên bản
trình duyệt và nguyên văn lỗi nếu bị chặn.

Nếu kết quả mơ hồ thì mới dựng một trang tĩnh thật trên HTTPS (GitHub Pages qua `gh`, hoặc
Cloudflare Pages) rồi đo lại.

## Cách đo câu 2

Bun CHƯA được cài trên máy này (chỉ có Node v24.14.1). Trước khi cài bất cứ thứ gì toàn cục,
HỎI người dùng. Nếu không cài Bun thì đo bằng Node SEA (Node 24 có sẵn) — kết luận vẫn dùng được,
chỉ cần ghi rõ đã đo bằng đường nào.

Sau khi có .exe: chạy nó và gọi thật MultiZen MCP. Tham khảo
src/lib/antidetect/multizen-mcp-client.ts để biết giao thức.
MultiZen nghe ở http://127.0.0.1:7777/mcp, cần header:
Authorization: Bearer <token nằm trong ~/.claude.json, mục mcpServers.multizen.headers>
Server này đã được cấu hình sẵn cho Claude Code với tên "multizen" — nếu tool multizen.* có sẵn
thì dùng luôn, đỡ phải tự gọi HTTP.

Lý tưởng là chạy .exe trên một máy Windows KHÁC không cài Node. Không có máy thứ hai thì ghi rõ
trong báo cáo là chưa kiểm được điều kiện đó.

## Môi trường

- Windows 11. Có PowerShell và Git Bash, mỗi cái cú pháp riêng
- Node v24.14.1, npm. Bun chưa có
- RAM trống chỉ khoảng 2.6GB → ĐỪNG chạy `npm run build`, đừng chạy Playwright, đừng bật Docker
- Postgres 17 đã cài sẵn và đang chạy (dịch vụ postgresql-x64-17), binaries ở
  C:\Program Files\PostgreSQL\17\bin nhưng chưa có trên PATH. Phase 00 không cần tới nó

## Ràng buộc

- **Đừng đụng vào git.** Không commit, không đổi branch, không stash. Branch hiện tại
  (feat/rut-gon-luong-dang-bai) đang có việc dở chưa commit của tính năng băng thông proxy
- **Chỉ tạo file trong `spike/` và `plans/reports/`.** Không sửa file nào trong `src/`,
  `prisma/`, hay `scripts/`
- **Không spawn subagent.** Làm inline bằng Read/Grep/Edit/Bash (xem CLAUDE.md)
- CORS trong spike khai đúng một nguồn, KHÔNG dùng `*` — để không ai chép nhầm cấu hình lỏng
  sang bản thật sau này
- Không đụng tới credential thật, không nối database

## Kết quả cần giao

1. Báo cáo `plans/reports/spike-<YYMMDD-HHMM>-trinh-duyet-goi-cau-noi.md` gồm:
   - Trả lời CÓ/KHÔNG cho từng câu, kèm bằng chứng và phiên bản trình duyệt đã đo
   - Nguyên văn lỗi nếu bị chặn
   - Khuyến nghị: giữ thiết kế hiện tại hay phải đổi sang đường tab nhỏ toàn bộ
   - Mục "chưa kiểm được" nếu có điều kiện nào không dựng được
2. Cập nhật ngược kết luận vào
   plans/260804-1752-web-chung-cho-team-phan-tan/plan.md và phase-00-*.md
3. **Xóa thư mục `spike/`** — không để lại code nghe cổng cục bộ trong repo

## Viết lách

Tiếng Việt. Ngắn gọn, hy sinh ngữ pháp để súc tích. Cuối báo cáo liệt kê câu chưa trả lời nếu có.
```

---

## Ghi chú cho người dán prompt

- Nếu session mới báo chưa thấy tool `multizen.*`, khởi động lại Claude Code — server MCP vừa
  được thêm vào `~/.claude.json` ngày 04/08/2026 và cần nạp lại.
- Spike này **không** cần Postgres, không cần Railway, không cần tài khoản nào. Chạy offline được
  trừ bước dựng trang HTTPS (mà cách nhanh dùng devtools console thì không cần dựng gì).
- Nếu người làm hỏi có được cài Bun không: cài bằng `npm i -g bun` là đủ cho spike.
