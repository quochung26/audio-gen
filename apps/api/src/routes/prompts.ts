import { Hono } from "hono";
import { isPromptStep, prisma, type PromptStep } from "@audio/database";
import {
  checkPromptVariables,
  GEN_PARAMS,
  knownGenParams,
  parseGenParams,
  pickPrompt,
  PROMPT_VARIABLES,
  unknownGenParamKeys,
} from "@audio/llm";
import { field, UserError } from "../lib/http";

export const prompts = new Hono();

prompts.get("/", async (c) => {
  const rows = await prisma.prompt.findMany({
    orderBy: [{ step: "asc" }, { genre: "asc" }, { version: "desc" }],
  });
  // Which version is ACTUALLY used — ask the same function the worker uses,
  // rather than re-deriving the rule.
  const withWinner = rows.map((p) => {
    const active = rows.filter((x) => x.step === p.step && x.active);
    return { ...p, wins: pickPrompt(active, p.genre === "*" ? undefined : p.genre)?.id === p.id };
  });
  return c.json({
    prompts: withWinner.map((p) => ({
      ...p,
      params: knownGenParams(p.params),
      unknownParams: unknownGenParamKeys(p.params),
    })),
    steps: Object.keys(PROMPT_VARIABLES),
    // The spec table rides along so Studio can build inputs without copying the
    // valid ranges — copy them and sooner or later the UI accepts what the API
    // rejects.
    genParams: GEN_PARAMS,
  });
});

prompts.get("/:id", async (c) => {
  const id = c.req.param("id");
  const prompt = await prisma.prompt.findUniqueOrThrow({ where: { id } });
  const siblings = await prisma.prompt.findMany({ where: { step: prompt.step, active: true } });
  const runs = await prisma.llmRun.count({ where: { promptId: id } });

  return c.json({
    prompt: {
      ...prompt,
      params: knownGenParams(prompt.params),
      unknownParams: unknownGenParamKeys(prompt.params),
    },
    genParams: GEN_PARAMS,
    wins: pickPrompt(siblings, prompt.genre === "*" ? undefined : prompt.genre)?.id === id,
    // A row's `step` is text, so it is checked rather than trusted. A row naming a
    // step the code no longer has is not an error to throw on — the page still has to
    // render so you can see it and delete it — it simply has no variables to check
    // against.
    ...(isPromptStep(prompt.step)
      ? {
          check: checkPromptVariables(prompt.step, prompt.content),
          available: PROMPT_VARIABLES[prompt.step],
        }
      : { check: null, available: [] }),
    runs,
  });
});

/**
 * Save a prompt.
 *
 * Blocks at save time if it uses a variable the step does not pass in:
 * `renderTemplate` throws when the job runs, and by then you are halfway through
 * a long write.
 */
prompts.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const content = String(body.content ?? "");
  if (!content.trim()) throw new UserError("The prompt is empty");

  const existing = await prisma.prompt.findUniqueOrThrow({ where: { id } });
  if (!isPromptStep(existing.step)) {
    throw new UserError(
      `This prompt is for "${existing.step}", which is not a step the code has any more. ` +
        "Delete it, or reseed with `pnpm db:seed`.",
    );
  }
  const check = checkPromptVariables(existing.step, content);
  if (check.unknown.length > 0) {
    throw new UserError(
      `Step ${existing.step} does not pass: ${check.unknown.map((v) => `{{${v}}}`).join(", ")}. ` +
        // From the declaration table, NOT from what the prompt currently uses —
        // with `used`, the offending variable itself gets listed as available.
        `Available variables: ${PROMPT_VARIABLES[existing.step].map((v) => `{{${v}}}`).join(", ")}.`,
    );
  }

  // Parameters arrive as separate fields rather than one JSON blob: mistyping a
  // key used to say nothing at all, the parameter was quietly dropped.
  const parsed = parseGenParams(body as Record<string, unknown>);
  if (parsed.errors.length > 0) throw new UserError(parsed.errors.join("; "));

  await prisma.prompt.update({
    where: { id },
    data: {
      content,
      model: field(body, "model") || null,
      note: field(body, "note") || null,
      params: parsed.params,
    },
  });
  return c.json({ ok: "Saved. Jobs started from now use the new version; running jobs keep the old one." });
});

/**
 * Create a genre variant of a prompt — how to make the AI write differently for
 * one genre without touching the default.
 */
/**
 * Edit ONLY the generation parameters, leaving the prompt body alone.
 *
 * So the settings page can tune temperature for every step on one screen instead
 * of opening each prompt page in turn.
 */
prompts.put("/:id/params", async (c) => {
  const body = await c.req.parseBody();
  const parsed = parseGenParams(body as Record<string, unknown>);
  if (parsed.errors.length > 0) throw new UserError(parsed.errors.join("; "));

  const p = await prisma.prompt.update({
    where: { id: c.req.param("id") },
    data: { params: parsed.params },
    select: { step: true },
  });
  return c.json({ ok: `Saved the parameters for ${p.step}.` });
});

prompts.post("/variants/:step", async (c) => {
  // A step arriving from a URL. Postgres used to reject a bad one because the column
  // was an enum; it is text now, and without this a typo makes a Prompt row that
  // matches no step and is never used again.
  const step = c.req.param("step");
  if (!isPromptStep(step)) throw new UserError(`No such prompt step: "${step}"`);
  const body = await c.req.parseBody();
  const genre = field(body, "genre");

  if (!genre) throw new UserError("Missing genre name");
  if (genre === "*") throw new UserError('Using "*" edits the default itself, it does not create a variant');

  const existing = await prisma.prompt.findFirst({ where: { step, genre } });
  if (existing) throw new UserError(`"${genre}" already has a variant for this step`);

  const source = await prisma.prompt.findFirstOrThrow({
    where: { step, genre: "*" },
    orderBy: { version: "desc" },
  });

  const created = await prisma.prompt.create({
    data: {
      step,
      genre,
      version: 1,
      // Copy the default as a starting point — editing something that already
      // works is safer than writing from a blank page.
      content: source.content,
      model: source.model,
      params: source.params ?? {},
      active: true,
      note: `Variant for "${genre}", copied from the default`,
    },
  });
  return c.json({ id: created.id });
});

prompts.put("/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const p = await prisma.prompt.findUniqueOrThrow({ where: { id } });

  if (p.active && p.genre === "*") {
    const others = await prisma.prompt.count({
      where: { step: p.step, genre: "*", active: true, id: { not: id } },
    });
    if (others === 0) {
      throw new UserError(
        `This is the only enabled default for step ${p.step}. ` +
          "Turn it off and every job of that step fails.",
      );
    }
  }

  await prisma.prompt.update({ where: { id }, data: { active: !p.active } });
  return c.json({ ok: p.active ? "Turned off." : "Turned back on." });
});

/** Delete a variant. The `*` default cannot be deleted — nothing would replace it. */
prompts.delete("/:id", async (c) => {
  const p = await prisma.prompt.findUniqueOrThrow({ where: { id: c.req.param("id") } });
  if (p.genre === "*") {
    throw new UserError("The default cannot be deleted. Edit its content instead.");
  }
  await prisma.prompt.delete({ where: { id: p.id } });
  return c.json({ ok: true });
});
