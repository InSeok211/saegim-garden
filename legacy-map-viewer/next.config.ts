import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase Hosting 정적 배포용: out/ 폴더로 정적 export
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
