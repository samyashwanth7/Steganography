import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/Steganography",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

