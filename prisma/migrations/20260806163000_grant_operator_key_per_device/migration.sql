-- Bỏ đường "mã mời": khóa vùng operator giờ được bọc cho RIÊNG một chiếc máy và nằm ngay trên
-- hàng của máy đó, không còn là một tấm vé lơ lửng ai cầm cũng dùng được.
--
-- Vì sao gỡ bằng một migration mới thay vì xóa migration đã tạo ra bảng: bảng đó ĐÃ được áp vào
-- database. Xóa thư mục migration của một thứ đã áp là để lại một hàng trong `_prisma_migrations`
-- không còn file tương ứng, và mọi lượt `migrate` sau đó dừng lại vì lệch. Thêm một bước lùi thì
-- lịch sử dài hơn một nhịp nhưng chạy được ở cả database đang có lẫn database dựng mới.
DROP TABLE "RelayInvite";

-- AlterTable
ALTER TABLE "RelayDevice" ADD COLUMN     "operatorKeyGrant" TEXT,
ADD COLUMN     "operatorKeyGrantedAt" TIMESTAMP(3),
ADD COLUMN     "operatorKeyReadyAt" TIMESTAMP(3);
