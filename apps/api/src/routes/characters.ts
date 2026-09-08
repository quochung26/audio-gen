import { Hono } from "hono";
import { isLanguage, worldSetupSchema } from "@audio/core";
import { getDefaultLanguage } from "@audio/llm";
import { enqueue } from "../lib/queue";
import { resolveCast } from "../lib/cast";
import { field, splitLines, UserError } from "../lib/http";

export const characters = new Hono();

/**
 * Invent one character with the model.
 *
 * Mounted outside `/api/series/:id` because it serves BOTH the Characters page of a
 * story that exists and the cast picker on the New story page, where there is no id
 * yet — one endpoint rather than two that would drift apart.
 *
 * Queues rather than calling the model here: the API never runs a model. Going
 * straight at Ollama from this handler would skip the VRAM guard and load a second
 * model on top of whatever scene the worker is writing.
 */
characters.post("/auto", async (c) => {
  const body = await c.req.parseBody();
  const seriesId = field(body, "seriesId");

  // Whatever the writer had already typed. Sent back down so the model fills only
  // the blanks and Studio gets a character it can drop straight into the form.
  const typed = {
    name: field(body, "name"),
    role: field(body, "role"),
    description: field(body, "description"),
    speech: field(body, "speech"),
    outfit: field(body, "outfit"),
    appearance: field(body, "appearance"),
    voiceHint: field(body, "voiceHint"),
  };

  if (seriesId) {
    const job = await enqueue({ type: "CHARACTER", payload: { seriesId, ...typed } });
    return c.json({ jobId: job.id });
  }

  // No story yet — the context is the New story form as it stands. Read exactly the
  // fields that form posts, so a character invented before the outline and one
  // invented after it are looking at the same story.
  const language = field(body, "language");
  if (language && !isLanguage(language)) throw new UserError(`Invalid language: "${language}"`);

  const world = worldSetupSchema.parse({
    setting: field(body, "setting"),
    tone: field(body, "tone"),
    rules: splitLines(body.rules),
    constraints: splitLines(body.constraints),
    glossary: [],
  });

  const job = await enqueue({
    type: "CHARACTER",
    payload: {
      ...typed,
      idea: field(body, "idea"),
      genre: field(body, "genre"),
      tags: field(body, "tags"),
      language: language || (await getDefaultLanguage()),
      world,
      // The cast already picked, so the model does not hand back someone the writer
      // has on screen under a different description.
      cast: await resolveCast(body),
    },
  });
  return c.json({ jobId: job.id });
});
