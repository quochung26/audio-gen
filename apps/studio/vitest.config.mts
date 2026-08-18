import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@/` là alias của Next, vitest không tự biết.
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.test.ts"] },
});
