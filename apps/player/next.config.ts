import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages ship TypeScript source, so Next has to compile them itself.
  transpilePackages: ["@audio/database", "@audio/config", "@audio/core"],
};

export default config;
