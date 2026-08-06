import next from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 xuất thẳng flat config — không cần FlatCompat như hướng dẫn cũ
 * (lớp tương thích đó còn làm ESLint 9 vỡ lúc validate schema của plugin react).
 *
 * Chủ trương: lint để bắt lỗi thật, không để bắt bẻ phong cách.
 * Xem ~/.claude/rules/development-rules.md.
 */
const config = [
  {
    // `relay/dist/**` là sản phẩm của `npm run relay:build`, không phải mã người viết. ESLint
    // **không đọc `.gitignore`**, nên thư mục này bị lint dù git đã bỏ qua nó — và nó chứa
    // `relay-bundle.cjs`, một file `.cjs` không khớp glob của eslint-config-next. Hệ quả là
    // ESLint đổ ngay từ bước dựng cấu hình ("không tìm thấy plugin react-hooks") thay vì báo một
    // lỗi lint, tức cả `npm run lint` chết chỉ vì có người vừa build.
    ignores: [".next/**", "node_modules/**", "data/**", "prisma/migrations/**", "relay/dist/**"],
  },
  ...next,
  ...nextTypescript,
  {
    rules: {
      // Biến bỏ đi có chủ đích được đặt tên bắt đầu bằng "_" — ví dụ `_prev` trong server action,
      // chữ ký đó do React quy định chứ không phải ta chọn.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],

      // Cảnh báo, không chặn. Luật này của React Compiler nói về hiệu năng (render dây chuyền),
      // không phải về đúng/sai. Bốn chỗ đang vướng đều là idiom chuẩn cho đúng vấn đề của nó:
      // đặt giờ mặc định sau khi mount (đặt lúc render là vỡ hydrate vì server/client lệch giờ),
      // và xóa lựa chọn đã hết hợp lệ khi đổi nick sang nền tảng khác.
      // Viết lại phần UI đó cần có test UI trước — chưa có, nên chưa động vào.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
