import { redirect } from "next/navigation";

/**
 * Trang tải cũ, nay chỉ còn là đường chuyển tiếp.
 *
 * Nội dung đã về `/setup#download` (xem `relay-download-section.tsx`). Giữ lại route này chứ không
 * xóa: địa chỉ `/relay-download` nằm trong tài liệu vận hành, trong tin nhắn cũ, và trong thói
 * quen gõ tay của người đã dùng. Xóa hẳn thì họ ăn 404 và kết luận công cụ hỏng — đắt hơn nhiều
 * lần một file ba dòng.
 *
 * KHÔNG liên quan tới `/api/relay/download/vN`, đường tải artifact thật. MKT Browser ghim đúng
 * địa chỉ đó trong `relay-release.json`, nên nó phải đứng yên.
 */
export default function RelayDownloadPage() {
  redirect("/setup#download");
}
