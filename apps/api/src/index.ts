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
import { characters } from "./routes/characters";
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
 * Studio's API.
 *
 * Studio is an SPA (Vite), so anything touching the DB or the queue goes through
 * here. Redis and BullMQ live only in this process and in the worker — the UI
 * does not know they exist.
 *
 * Local machine only: no auth, no rate limiting. Do not expose it to the internet.
 */
const app = new Hono();

// Hono's `serveStatic` resolves against cwd, so this has to be a relative path.
const SPA_DIR = relative(process.cwd(), resolve(import.meta.dirname, "../../studio/dist")) || ".";

// The Vite dev server runs on another port, so the browser treats it as cross-origin.
app.use("/*", cors({ origin: (o) => o ?? "*", credentials: true }));

app.get("/health", async (c) => {
  await prisma.$queryRaw`SELECT 1`;
  return c.json({ ok: true });
});

app.route("/api/series", series);
app.route("/api/genres", genres);
app.route("/api/character-cards", characterCards);
app.route("/api/characters", characters);
app.route("/api/episodes", episodes);
app.route("/api/prompts", prompts);
app.route("/api/tracks", tracks);
app.route("/api/jobs", jobs);
app.route("/api/models", models);
app.route("/api/stats", stats);
app.route("/api/audio", audio);
app.route("/api/comments", comments);

/**
 * Serves Studio's build in production — one process, one port.
 *
 * In development Vite serves the UI and proxies `/api` here, so this never runs.
 * `serveStatic` sits AFTER the API routes so it does not swallow them, and any
 * path not matching a file returns index.html because the router lives in the
 * browser — loading /prompts directly must give the app, not a 404.
 */
if (existsSync(SPA_DIR)) {
  app.use("/*", serveStatic({ root: SPA_DIR }));
  app.get("/*", serveStatic({ path: "./index.html", root: SPA_DIR }));
  console.log(`[api] serving the UI from ${SPA_DIR}`);
}

app.onError((err, c) => {
  if (err instanceof UserError) return c.json({ error: err.message }, 400);
  console.error("[api]", err);

  // DB older than the schema: a table (P2021) or column (P2022) the code needs
  // is not actually in Postgres. Read only the error CODE, never Prisma's own
  // message — the source excerpt it embeds can contain a connection string with
  // a password (see lib/player-db.ts).
  const code = (err as { code?: unknown }).code;
  if (code === "P2021" || code === "P2022") {
    return c.json(
      {
        error:
          "The database is missing a table or column the code needs. Run `pnpm db:push` " +
          "(or `pnpm db:push:player` for the hosted one) to bring it up to date.",
      },
      500,
    );
  }

  // Hide the detail of unexpected errors, but log it fully on the server.
  return c.json({ error: "Something unexpected went wrong. Check the API log." }, 500);
});

app.notFound((c) => c.json({ error: "No such endpoint" }, 404));

const port = Number(process.env.API_PORT ?? 3002);
const env = loadEnv();

// The LLM provider is not printed: it is a DB row now, and reading it here would
// make startup wait on Postgres just to log a line. The Models page shows it.
console.log(`[api] TTS=${env.TTS_PROVIDER} storage=${env.STORAGE_DRIVER}`);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] http://localhost:${info.port}`);
});
