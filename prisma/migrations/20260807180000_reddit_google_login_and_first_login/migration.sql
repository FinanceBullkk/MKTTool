-- Nick Reddit đăng nhập bằng Google, và mốc "đã đăng nhập lần đầu".
--
-- Ba câu, và hai câu giữa là câu ĐỘNG VÀO DỮ LIỆU ĐANG CÓ — đọc chú thích trước khi chạy trên
-- database thật. Sao lưu bằng `npm run db:backup` trước.

-- 1. Mật khẩu nick thành tùy chọn.
--
-- Nick Reddit của team đăng nhập bằng nút "Continue with Google", tức không tồn tại một mật khẩu
-- Reddit nào. Cột NOT NULL buộc người nhập bịa một chuỗi cho qua ràng buộc.
ALTER TABLE "Account" ALTER COLUMN "passwordEnc" DROP NOT NULL;

-- 2. Dọn những chuỗi bịa đó đi. MỘT CHIỀU — máy chủ không giữ khóa vùng operator nên không
--    giải mã được để xem lại, và không có đường dựng lại sau khi xóa.
--
--    Chỉ chạm nick REDDIT. Nick Facebook có mật khẩu thật và giữ nguyên.
UPDATE "Account" SET "passwordEnc" = NULL WHERE "platform" = 'REDDIT';

-- 3. Mốc đăng nhập lần đầu.
ALTER TABLE "Account" ADD COLUMN "firstLoginAt" TIMESTAMP(3);

-- Lấp cho dữ liệu cũ: trước hôm nay, id profile chỉ được dán vào SAU KHI đã đăng nhập tay xong
-- trong MultiZen — nên "có profile" hàm ý "đã đăng nhập". Không lấp thì cả đàn nick đang chạy
-- báo đỏ cùng lúc, và một dải đỏ thường trực thì không ai đọc nữa.
UPDATE "Account" SET "firstLoginAt" = "createdAt" WHERE "antidetectProfileId" IS NOT NULL;
