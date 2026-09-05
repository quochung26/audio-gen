import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { UserError } from "./lib/http";
import { audio } from "./routes/audio";
import { characterCards } from "./routes/character-cards";
import { comments } from "./routes/comments";
import { episodes } from "./routes/episodes";
import { jobs } from "./routes/jobs";
import { models } from "./routes/models";
import { prompts } from "./routes/prompts";
import { genres } from "./routes/genres";
import { series } from "./routes/series";
import { stats } from "./routes/stats";
import { tracks } from "./routes/tracks";

/**
 * API của Studio.
 *
 * Studio là SPA (Vite) nên mọi thứ chạm DB hay hàng đợi phải qua đây. Redis và
 * BullMQ chỉ nằm ở tiến trình này và ở worker — giao diện không biết chúng tồn tại.
 *
 * Chỉ phục vụ máy tại chỗ: không xác thực, không rate limit. Đừng mở ra internet.
 */
const app = new Hono();

// `serveStatic` của Hono giải đường dẫn theo cwd, nên phải là đường dẫn tương đối.
const SPA_DIR = relative(process.cwd(), resolve(import.meta.dirname, "../../studio/dist")) || ".";

// Vite dev server chạy cổng khác nên trình duyệt coi là cross-origin.
app.use("/*", cors({ origin: (o) => o ?? "*", credentials: true }));

app.get("/health", async (c) => {
  await prisma.$queryRaw`SELECT 1`;
  return c.json({ ok: true });
});

app.route("/api/series", series);
app.route("/api/genres", genres);
app.route("/api/character-cards", characterCards);
app.route("/api/episodes", episodes);
app.route("/api/prompts", prompts);
app.route("/api/tracks", tracks);
app.route("/api/jobs", jobs);
app.route("/api/models", models);
app.route("/api/stats", stats);
app.route("/api/audio", audio);
app.route("/api/comments", comments);

/**
 * Phục vụ bản build của Studio khi chạy production — một tiến trình, một cổng.
 *
 * Lúc dev thì Vite phục vụ giao diện và proxy `/api` sang đây, nên phần này
 * không chạy tới. `serveStatic` đặt SAU các route API để không nuốt mất chúng,
 * và mọi đường dẫn không khớp file đều trả index.html vì router nằm ở phía
 * trình duyệt — tải thẳng /prompts phải ra app chứ không phải 404.
 */
if (existsSync(SPA_DIR)) {
  app.use("/*", serveStatic({ root: SPA_DIR }));
  app.get("/*", serveStatic({ path: "./index.html", root: SPA_DIR }));
  console.log(`[api] phục vụ giao diện từ ${SPA_DIR}`);
}

app.onError((err, c) => {
  if (err instanceof UserError) return c.json({ error: err.message }, 400);
  console.error("[api]", err);

  // DB cũ hơn schema: bảng (P2021) hay cột (P2022) mà code đang cần chưa có
  // thật trong Postgres. Chỉ đọc MÃ lỗi, không lấy nguyên văn thông báo của
  // Prisma — khối trích dẫn mã nguồn trong đó có thể chứa chuỗi kết nối kèm
  // mật khẩu (xem lib/player-db.ts).
  const code = (err as { code?: unknown }).code;
  if (code === "P2021" || code === "P2022") {
    return c.json(
      {
        error:
          "DB chưa có bảng hoặc cột mà code đang cần. Chạy `pnpm db:push` " +
          "(hoặc `pnpm db:push:player` nếu là DB hosted) để cập nhật DB.",
      },
      500,
    );
  }

  // Giấu chi tiết lỗi không lường trước, nhưng log đầy đủ ở server.
  return c.json({ error: "Có lỗi không lường trước. Xem log của API." }, 500);
});

app.notFound((c) => c.json({ error: "Không có endpoint này" }, 404));

const port = Number(process.env.API_PORT ?? 3002);
const env = loadEnv();

console.log(`[api] LLM=${env.LLM_PROVIDER} TTS=${env.TTS_PROVIDER} storage=${env.STORAGE_DRIVER}`);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] http://localhost:${info.port}`);
});
