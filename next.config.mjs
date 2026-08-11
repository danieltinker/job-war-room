/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["bullmq", "ioredis", "bcryptjs"],
  },
};

export default nextConfig;
