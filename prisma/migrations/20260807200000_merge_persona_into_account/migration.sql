-- Gộp bảng "Persona" thành hai cột trên "Account".
--
-- Bảng đó đổi lại được đúng hai dòng chữ hiển thị ở trang chi tiết nick — không một đường code nào
-- ngoài phần hiển thị đọc tới nó, kể cả bộ luật (luật 7 so trùng văn bản thật, không đọc giọng).
-- Cái giá thì có thật: khóa ngoại NOT NULL chặn cửa nhập nick khi kho chưa có nhân vật nào.
--
-- Câu 2 ĐỌC dữ liệu đang có, câu 3 và 4 XÓA. Sao lưu bằng `npm run db:backup` trước khi chạy trên
-- database thật.

-- 1. Hai cột mới. Nullable — thiếu giọng nay là "chưa sẵn sàng" (`NO_VOICE`) chứ không phải
--    "không tạo nổi nick", cùng khuôn với `antidetectProfileId`.
ALTER TABLE "Account" ADD COLUMN "voice" TEXT;
ALTER TABLE "Account" ADD COLUMN "contentAngle" TEXT;

-- 2. Chép giọng của nhân vật về từng nick đang trỏ tới nó.
--
--    Chép thẳng chứ không phải tổng hợp: khóa ngoại là NOT NULL và trỏ tới đúng một hàng, nên
--    không có nick nào nhập nhằng giữa hai giọng.
--
--    `Persona.notes` KHÔNG có chỗ đổ — nó là ghi chú *về nhân vật*, không phải về nick, và không
--    có cột tương ứng. Muốn giữ thì đọc ra trước khi chạy migration này:
--        SELECT "name", "notes" FROM "Persona" WHERE "notes" IS NOT NULL;
UPDATE "Account" a
SET "voice"        = p."voice",
    "contentAngle" = p."contentAngle"
FROM "Persona" p
WHERE a."personaId" = p."id";

-- 3. Cắt khóa ngoại rồi bỏ cột.
ALTER TABLE "Account" DROP CONSTRAINT "Account_personaId_fkey";
ALTER TABLE "Account" DROP COLUMN "personaId";

-- 4. MỘT CHIỀU. Sau câu này `Persona.notes` không lấy lại được từ database nữa, chỉ còn trong
--    bản sao lưu ở câu đầu file.
DROP TABLE "Persona";
