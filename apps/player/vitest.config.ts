import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: {
    // .ts files only. The Player's .tsx components canNOT be tested here: tsconfig sets
    // `jsx: "preserve"` for Next, and vite cannot parse JSX with that setting —
    // `esbuild.tsconfigRaw` and pragmas alike are ignored by rolldown. So the logic worth
    // testing is pulled out into .ts files (useOffline, cache-key, rss, range) and tested
    // there.
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
  },
});
