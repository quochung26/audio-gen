import type { NextConfig } from "next";

const config: NextConfig = {
  // Package workspace ship mã TypeScript nguồn nên Next phải tự biên dịch.
  transpilePackages: ["@audio/database", "@audio/config", "@audio/core"],
};

export default config;
