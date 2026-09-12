import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  server: {
    // Nghe trên mọi card mạng, không chỉ loopback — để mở Studio từ máy khác trong
    // LAN. Worker và API vốn đã vậy, Player khai thẳng `--hostname 0.0.0.0`; Studio
    // đóng chỉ vì đó là mặc định của Vite, không phải vì ai quyết thế.
    //
    // Studio KHÔNG có đăng nhập. Ai vào được cổng này là tạo/xoá truyện được và bấm
    // được các nút tiêu tiền OpenRouter. Hợp với LAN nhà; đừng chĩa ra Internet.
    host: true,
    // Gọi API qua cùng origin để không phải bận tâm CORS lúc dev, và để đường
    // dẫn `/api/...` trong code giống hệt khi build production đứng sau proxy.
    //
    // `localhost` ở đây được phân giải bởi VITE trên máy chạy nó, không phải bởi
    // trình duyệt — nên máy khác chỉ cần mở được cổng 3000, không cần với tới 3002.
    proxy: { "/api": { target: "http://localhost:3002", changeOrigin: true } },
  },
});
