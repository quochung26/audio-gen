import { defineConfig } from "vitest/config";

export default defineConfig({
  // ffmpeg tốn thời gian thật; mặc định 5s của vitest không đủ.
  test: { include: ["src/**/*.test.ts"], testTimeout: 120_000, hookTimeout: 60_000 },
});
