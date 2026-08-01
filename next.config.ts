import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright và Prisma phải chạy ở Node runtime, không bundle vào edge/client.
  serverExternalPackages: ["playwright", "@prisma/client"],
};

export default nextConfig;
