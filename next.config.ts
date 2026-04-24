import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./prisma/dev.db"],
  },
  reactCompiler: true,
};

export default nextConfig;
