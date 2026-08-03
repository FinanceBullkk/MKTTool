import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright và Prisma phải chạy ở Node runtime, không bundle vào edge/client.
  serverExternalPackages: ["playwright", "@prisma/client"],

  experimental: {
    /**
     * Chặn số worker lúc build.
     *
     * Mặc định Next mở một worker cho mỗi core — máy 12 core thành 11 tiến trình Node cùng lúc.
     * Máy chạy công cụ này có 16GB nhưng thường chỉ còn 2–3GB trống (trình duyệt antidetect và
     * Chrome ăn phần lớn), nên build mặc định chết giữa chừng bằng crash của worker
     * (`code 134`, `3221226505`) — trông y hệt lỗi code nhưng chỉ là hết RAM.
     *
     * Chỉ có 6 trang tĩnh phải dựng, còn lại đều `force-dynamic`, nên 2 worker chậm hơn không
     * đáng kể mà đổi lại build chạy xong.
     */
    cpus: 2,
    /** Giảm tiếp số worker khi máy đang cạn RAM, thay vì cứ mở đủ hạn mức trên. */
    memoryBasedWorkersCount: true,
  },
};

export default nextConfig;
