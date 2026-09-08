import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient, PromptStep, TtsEngine, VoiceTier, LicenseType } from "@prisma/client";

const prisma = new PrismaClient();

/** The prompts/ directory at the repo root, relative to packages/database/prisma/ */
const PROMPTS_DIR = join(import.meta.dirname, "../../../prompts");

/**
 * A blank `model` means use whatever model is configured for that step. Three of the
 * utility steps used to say "utility" — which is NOT the name of any model, and now
 * that jobs actually read `Prompt.model`, leaving it would call Ollama asking for a
 * model called "utility".
 */
const PROMPT_FILES: Array<{ step: PromptStep; file: string; model?: string }> = [
  { step: "OUTLINE", file: "outline.md" },
  { step: "STORY_SO_FAR", file: "story-so-far.md" },
  { step: "CHARACTER", file: "character.md" },
  { step: "NEXT_EPISODE", file: "next-episode.md" },
  { step: "NEXT_CHAPTER", file: "next-chapter.md" },
  { step: "WRITE_SCENE", file: "write-scene.md" },
  { step: "TRANSLATE", file: "translate.md" },
  { step: "AUDIO_EDIT", file: "audio-edit.md" },
  { step: "SUMMARIZE", file: "summarize.md" },
  { step: "METADATA", file: "metadata.md" },
];

/**
 * Generation parameters per step — creative prose needs a higher temperature than
 * utility work.
 *
 * The three summarising steps run at 0.2. They are not writing anything: they read a
 * text and say what is in it, under instructions with hard edges — "ONE paragraph",
 * "at most N words", "no bullet points", "return the summary text only". Temperature
 * is what buys a model room to ignore those, and they had none to spend: a summary
 * that reads a little more interestingly is worth nothing, while one that quietly
 * grows past its word ceiling costs context in every later prompt that loads it.
 */
const PARAMS: Partial<Record<PromptStep, Record<string, number>>> = {
  OUTLINE: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 8192, maxTokens: 2500 },
  // `numCtx` has to hold the running summary AND a full-length scene. `maxTokens`
  // sits well above the word ceiling the prompt asks for, so a model writing right up
  // to it is not cut off mid-sentence — a truncated paragraph here is fed into the next
  // compression and the damage carries forward for the rest of the story.
  STORY_SO_FAR: { temperature: 0.2, repeatPenalty: 1.05, numCtx: 8192, maxTokens: 1000 },
  // One person, so `maxTokens` is small — but `numCtx` is not: the whole Story Bible
  // goes in, and a character invented without reading it duplicates someone.
  CHARACTER: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 700 },
  // A wider context than OUTLINE because it has to load the earlier episodes' summaries.
  NEXT_EPISODE: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 1200 },
  // One chapter, so `maxTokens` is a fraction of NEXT_EPISODE's. `numCtx` is not: it
  // reads the same running summary and the chapters already written.
  NEXT_CHAPTER: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 600 },
  // `maxTokens` has to sit well above the target: a model that writes thoroughly must
  // not be cut off mid-sentence, and a scene ending mid-sentence is worse than a short
  // one. 1,800 tokens ≈ 1,000 words, comfortably clear of the 600-word ceiling the
  // prompt asks for — it was 2,600 when a scene ran to 900.
  //
  // `repeatPenalty` lowered from 1.12 to 1.05: a heavy repetition penalty also
  // crushes DELIBERATE repetition, which is a real device — "A knock. Then another knock."
  WRITE_SCENE: { temperature: 0.95, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 1800 },
  // Lower than scene writing because the plot is already fixed, higher than audio
  // editing because it is still prose: 0.4 gives a flat translation that reads like a
  // news bulletin. `maxTokens` follows WRITE_SCENE — it rewrites one scene.
  TRANSLATE: { temperature: 0.7, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 1800 },
  AUDIO_EDIT: { temperature: 0.4, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 4000 },
  SUMMARIZE: { temperature: 0.2, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 900 },
  METADATA: { temperature: 0.8, repeatPenalty: 1.1, numCtx: 8192, maxTokens: 600 },
};

async function seedPrompts() {
  for (const { step, file, model } of PROMPT_FILES) {
    const content = await readFile(join(PROMPTS_DIR, file), "utf8");
    await prisma.prompt.upsert({
      where: { step_genre_version: { step, genre: "*", version: 1 } },
      update: { content, params: PARAMS[step] ?? {} },
      create: {
        step,
        genre: "*",
        version: 1,
        content,
        model: model ?? null,
        params: PARAMS[step] ?? {},
        active: true,
        note: `Loaded from prompts/${file}`,
      },
    });
  }

  // Prompts for a step that is no longer seeded from a file.
  //
  // Upserting alone leaves them: delete a file from prompts/ and its row keeps sitting in
  // the table, and `loadPrompt` keeps returning it — the step runs a prompt that no longer
  // exists in the repo, which is invisible until the prose comes out wrong.
  //
  // By STEP, never by content: a writer's genre variants are rows too, and theirs are for
  // steps that ARE seeded. Only a step that has left the catalogue entirely takes its rows
  // with it.
  //
  // This does NOT cover a step removed from the PromptStep enum — Postgres refuses to drop
  // an enum label while a row still holds it, so `prisma db push` fails before the seed is
  // ever reached. That case is handled before the push, in sql/002-prune-removed-enums.sql.
  const seeded = PROMPT_FILES.map((p) => p.step);
  const stale = await prisma.prompt.deleteMany({ where: { step: { notIn: seeded } } });

  console.log(
    `✔ ${PROMPT_FILES.length} prompt` + (stale.count > 0 ? ` (${stale.count} cũ đã xoá)` : ""),
  );
}

/**
 * Mock voices so the pipeline runs before real Kokoro exists.
 * Real voices are added in Phase 3 by scripts/seed-voices.
 */
/**
 * Overwrite content already in the DB rather than only creating what is missing.
 *
 * So the things the seed carries — genre descriptions, for instance — can be updated
 * on a machine set up earlier. Without it, a new description only ever reaches a
 * brand-new DB, while a machine in use keeps the first version forever.
 */
const OVERWRITE = process.env.SEED_OVERWRITE === "1";

/**
 * The starting genres.
 *
 * The descriptions are written as INSTRUCTIONS to the model, not dictionary
 * definitions: they go into the Story Bible, so the wording here affects the prose directly.
 *
 * Being instructions, they are written in ENGLISH like every other prompt — they sit
 * inside an English instruction block, and 7–14B models follow English instructions
 * markedly more closely. The NAMES stay Vietnamese: they are the lookup key
 * (`Series.genre`) and the key for choosing a prompt variant, and renaming one
 * silently strips the description from the Bible of every story using the old name.
 */
async function seedGenres() {
  const genres = [
    {
      name: "kinh dị",
      promptName: "horror",
      description:
        "Fear comes from what cannot be explained, not from gore. Keep the pace slow: lay down ordinary, everyday detail first, then let one detail go wrong. No jump scares.",
    },
    {
      name: "tình cảm",
      promptName: "romance",
      description:
        "The subject is a relationship between two people, and how it changes. Feeling shows through action and through silence, not through long interior monologue. Avoid sentimentality and dialogue that explains itself.",
    },
    {
      name: "trinh thám",
      promptName: "detective fiction",
      description:
        "The listener must be given enough clues to work it out. Never withhold a fact just to reveal it at the last minute. Each episode closes one small question and opens a larger one.",
    },
    {
      name: "đời thường",
      promptName: "slice of life",
      description:
        "Nothing dramatic happens. The weight sits in small detail and in what the characters do not say. Keep the tone level and let the listener see it for themselves.",
    },
    {
      name: "kỳ ảo",
      promptName: "fantasy",
      description:
        "The supernatural must run on clear rules, and those rules must never be broken to get a character out of a corner. Show the rules through scenes, not through narration.",
    },
  ];

  const before = await prisma.genre.findMany({ select: { name: true } });
  const have = new Set(before.map((g) => g.name));

  for (const g of genres) {
    await prisma.genre.upsert({
      where: { name: g.name },
      // By default do NOT overwrite an existing description: this is what the writer
      // tunes to their own voice, and losing it on a reseed is deeply annoying. Only
      // overwritten when explicitly asked — see OVERWRITE.
      //
      // `enabled` is left alone even when overwriting: a genre hidden on purpose that
      // the seed switches back on reappears in the picker with no explanation.
      update: OVERWRITE ? { description: g.description, promptName: g.promptName } : {},
      create: g,
    });
  }

  // Say what was actually done. The previous version always printed "✔ 5 genres" even
  // when it touched nothing — rerunning for new descriptions looked like it worked.
  const created = genres.filter((g) => !have.has(g.name)).length;
  const kept = genres.length - created;
  console.log(
    `✔ genres: ${created} new` +
      (kept > 0
        ? OVERWRITE
          ? `, ${kept} descriptions overwritten`
          : `, ${kept} left as they are (SEED_OVERWRITE=1 to load the new descriptions)`
        : ""),
  );
}

async function seedVoices() {
  // Each language needs its own voice set: a voice in the wrong language is skipped by
  // the voice resolver, so a gap means an English story cannot build audio even on the
  // mock. See apps/worker/src/services/voice-resolver.ts.
  const voices = [
    { externalVoiceId: "mock-narrator", name: "Người dẫn (giả lập)", gender: "male", ageRange: "adult", language: "vi" },
    { externalVoiceId: "mock-male", name: "Nam trung niên (giả lập)", gender: "male", ageRange: "adult", language: "vi" },
    { externalVoiceId: "mock-female", name: "Nữ trẻ (giả lập)", gender: "female", ageRange: "young", language: "vi" },
    { externalVoiceId: "mock-old", name: "Nam già (giả lập)", gender: "male", ageRange: "senior", language: "vi" },
    { externalVoiceId: "mock-en-narrator", name: "Narrator (mock)", gender: "male", ageRange: "adult", language: "en" },
    { externalVoiceId: "mock-en-male", name: "Adult male (mock)", gender: "male", ageRange: "adult", language: "en" },
    { externalVoiceId: "mock-en-female", name: "Young female (mock)", gender: "female", ageRange: "young", language: "en" },
    { externalVoiceId: "mock-en-old", name: "Senior male (mock)", gender: "male", ageRange: "senior", language: "en" },
  ];

  for (const v of voices) {
    await prisma.voice.upsert({
      where: { engine_externalVoiceId: { engine: TtsEngine.MOCK, externalVoiceId: v.externalVoiceId } },
      // Update `language` on existing rows too: the column did not exist in the
      // previous version, so every old voice carries the "vi" default.
      update: { language: v.language },
      create: {
        engine: TtsEngine.MOCK,
        tier: VoiceTier.FAST,
        licenseType: LicenseType.SELF_MADE,
        commercialOk: true,
        ...v,
      },
    });
  }
  console.log(`✔ ${voices.length} mock voices (vi + en)`);
}

/** The shared pronunciation dictionary — what Vietnamese TTS routinely mispronounces. */
async function seedPronunciations() {
  const entries = [
    { term: "wifi", replacement: "quai phai" },
    { term: "email", replacement: "i meo" },
    { term: "taxi", replacement: "tắc xi" },
    { term: "internet", replacement: "in tơ nét" },
    { term: "video", replacement: "vi đê ô" },
  ];

  const existing = await prisma.pronunciationEntry.findMany({
    where: { seriesId: null },
    select: { term: true },
  });
  const have = new Set(existing.map((e) => e.term));

  const fresh = entries.filter((e) => !have.has(e.term));
  if (fresh.length > 0) {
    await prisma.pronunciationEntry.createMany({
      data: fresh.map((e) => ({ ...e, seriesId: null })),
    });
  }
  console.log(`✔ ${fresh.length} new pronunciation rules (${have.size} already present)`);
}

async function main() {
  await seedPrompts();
  await seedGenres();
  await seedVoices();
  await seedPronunciations();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
