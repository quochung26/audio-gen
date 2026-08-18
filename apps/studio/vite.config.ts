import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  server: {
    // Gọi API qua cùng origin để không phải bận tâm CORS lúc dev, và để đường
    // dẫn `/api/...` trong code giống hệt khi build production đứng sau proxy.
    proxy: { "/api": { target: "http://localhost:3002", changeOrigin: true } },
  },
});
