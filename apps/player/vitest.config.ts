import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: {
    // Chỉ file .ts. Component .tsx của Player KHÔNG test được ở đây: tsconfig
    // để `jsx: "preserve"` cho Next, mà vite không parse nổi JSX với thiết lập
    // đó — `esbuild.tsconfigRaw` lẫn pragma đều bị rolldown bỏ qua. Nên phần
    // logic đáng test được tách hẳn ra file .ts (useOffline, cache-key, rss,
    // range) và test ở đó.
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
  },
});
