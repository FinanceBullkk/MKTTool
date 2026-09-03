"use client";

/**
 * Ô nhập bí mật của nick — khóa cứng cho tới khi JavaScript chạy xong.
 *
 * ## Vì sao không dùng thẳng `Field`
 *
 * Ba ô này chứa thứ **không được phép rời máy người dùng ở dạng trần**: cầu nối phải bọc chúng
 * trước (xem `account-vault-form.tsx`). Việc bọc đó do JavaScript làm.
 *
 * Trang chưa hydrate xong mà người dùng kịp gõ rồi Enter thì trình duyệt gửi form theo cách
 * mặc định của nó — tức là mật khẩu dạng trần bay thẳng lên máy chủ, đúng thứ cả GĐ3 dựng ra để
 * tránh, và không có gì báo. Ô `disabled` thì **không nằm trong FormData**, nên đường đó bị bịt
 * ở gốc chứ không dựa vào việc người dùng gõ chậm hơn trình duyệt.
 *
 * Đây là cùng một lối nghĩ với `guardedAction`: đặt phép chặn vào chỗ **không quên được**, thay
 * vì tin rằng thứ tự các sự kiện luôn diễn ra như mong đợi.
 */
import { useSyncExternalStore } from "react";
import { Field } from "@/components/ui/form-controls";

/**
 * Câu hỏi duy nhất cần trả lời: *đang chạy ở trình duyệt hay đang dựng HTML trên máy chủ?*
 *
 * `useSyncExternalStore` trả lời được nó trực tiếp — nó có sẵn hai nhánh cho hai phía, nên
 * không cần một lượt render thừa như cặp `useState` + `useEffect`. Không có gì để đăng ký theo
 * dõi ở đây (câu trả lời không bao giờ đổi sau khi hydrate), nên hàm `subscribe` trả về một hàm
 * hủy rỗng.
 */
const subscribeToNothing = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

export function VaultSecretField({
  label,
  name,
  type,
  required,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  // HTML gửi từ máy chủ luôn mang ô đã khóa — không có khe nào giữa "trang hiện ra" và
  // "trang đã sẵn sàng mã hóa".
  const ready = useHydrated();

  return (
    <Field
      label={label}
      name={name}
      type={type}
      required={required && ready}
      disabled={!ready}
      hint={ready ? hint : "Waiting for the page to be ready..."}
    />
  );
}
