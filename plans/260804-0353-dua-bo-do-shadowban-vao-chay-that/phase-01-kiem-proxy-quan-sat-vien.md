# Phase 01 — Kiểm proxy quan sát viên

**Trạng thái:** ✅ Xong 04/08/2026 (`f34ebf2`) · [← plan](plan.md)

## Vấn đề

Đợt 3 dựng bộ kiểm proxy còn sống, nhưng chỉ áp cho bảng `Proxy` (proxy của nick). Bảng
`ObserverProxy` không có đường nào để kiểm — mà nó lại là IP mà **toàn bộ kết luận shadowban
dựa vào**.

Hậu quả nếu proxy quan sát viên chết: mọi nick ra kết luận **Không dò được**. Đó vẫn là kết luận
trung thực (bộ dò không báo khỏe giả), nhưng người dùng không có cách nào biết nguyên nhân nằm ở
proxy chứ không ở Reddit — và sẽ đi sửa nhầm chỗ.

Nguy hiểm hơn: nếu proxy quan sát viên **không đổi IP** (nhánh RÒ ở đợt 3) thì bộ dò đang nhìn
Reddit bằng chính IP nhà. Nó vẫn trả kết luận trông có vẻ hợp lý, chỉ là kết luận đó vô nghĩa.

## Làm gì

Dùng lại nguyên bộ kiểm của đợt 3, chỉ thêm đường ghi sang bảng thứ hai.

**Sửa**
- `src/lib/proxies/proxy-liveness-check.ts` — tách phần **đo** khỏi phần **ghi**. Hiện
  `checkProxyLiveness()` làm cả hai và ghi cứng vào `prisma.proxy`.
- `prisma/schema.prisma` — thêm 4 cột kết quả kiểm vào `ObserverProxy`, y hệt `Proxy`
- `src/components/health/observer-proxy-section.tsx` — cột "Lần kiểm gần nhất" + nút "Kiểm"
- `src/components/health/observer-proxy-row-actions.tsx` — thêm nút kiểm vào cụm nút sẵn có

**Tạo**
- `src/lib/health/observer-proxy-check-action.ts` — server action kiểm một proxy quan sát viên

## Các bước

1. Tách `measureProxyLiveness()` (thuần đo, không chạm DB) khỏi `checkProxyLiveness()`.
   Hai hàm ghi mỏng gọi vào nó: một ghi bảng `Proxy`, một ghi bảng `ObserverProxy`.
2. Migration thêm 4 cột vào `ObserverProxy`.
3. Server action + nút, dùng lại `ProxyCheckControls` nếu khớp, không thì viết nút mỏng.
4. Câu chữ ở khối proxy quan sát viên phải nói rõ **vì sao kiểm cái này quan trọng hơn**:
   proxy nick chết thì mất một nick, proxy quan sát viên chết thì mù cả đàn.

## Xong là khi

- Bấm "Kiểm" ở khối proxy quan sát viên ra đúng 5 kết luận như proxy thường.
- Cột kết quả hiện được, "chưa kiểm lần nào" không hiện như đang khỏe.
- Không nhân đôi logic: chỉ có MỘT nơi quyết định kết luận (`proxy-liveness-verdict.ts`).

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Tách hàm làm hỏng đường kiểm proxy thường đang chạy tốt | Test hiện có phủ phần kết luận; chạy lại `npm test` + kiểm tay 1 proxy sau khi tách |
| Proxy quan sát viên chỉ nhận HTTP, người dùng khai SOCKS5 | Schema đã ép `z.literal("http")` — không cần thêm gì |
