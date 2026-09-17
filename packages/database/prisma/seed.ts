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
  { step: "NEXT_SCENE", file: "next-scene.md" },
  { step: "SCENE_BEAT", file: "scene-beat.md" },
  { step: "SCENE_CONTEXT", file: "scene-context.md" },
  { step: "WRITE_SCENE", file: "write-scene.md" },
  { step: "REVISE_PASSAGE", file: "revise-passage.md" },
  { step: "TRANSLATE", file: "translate.md" },
  { step: "AUDIO_EDIT", file: "audio-edit.md" },
  { step: "SUMMARIZE", file: "summarize.md" },
  { step: "METADATA", file: "metadata.md" },
];

/**
 * Generation parameters per step — creative prose needs a higher temperature than
 * utility work.
 *
 * `maxTokens` is a CEILING, and you are billed for what a model generates, not for the
 * room it was given. So the cost of setting it high is nothing and the cost of setting
 * it low is a job that fails three times and gives up — which is what these did: they
 * were sized against a local 14B writing tersely, and a larger model writing fuller
 * Vietnamese ran straight through them. Size them for the longest LEGITIMATE answer,
 * not the typical one.
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
  // `numCtx` has to hold the running summary AND a full 900-word scene. `maxTokens`
  // sits well above the word ceiling the prompt asks for, so a model writing right up
  // to it is not cut off mid-sentence — a truncated paragraph here is fed into the next
  // compression and the damage carries forward for the rest of the story.
  STORY_SO_FAR: { temperature: 0.2, repeatPenalty: 1.05, numCtx: 8192, maxTokens: 1500 },
  // One person, so `maxTokens` is small — but `numCtx` is not: the whole Story Bible
  // goes in, and a character invented without reading it duplicates someone.
  CHARACTER: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 1200 },
  // A wider context than OUTLINE because it has to load the earlier episodes' summaries.
  NEXT_EPISODE: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 1200 },
  // One chapter, so `maxTokens` is a fraction of NEXT_EPISODE's. `numCtx` is not: it
  // reads the same running summary and the chapters already written.
  NEXT_CHAPTER: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 1500 },
  // 0.9 — the default, the same as every other outlining step. It was 1.0 on the
  // argument that this button is pressed BECAUSE the first answer was not wanted, so
  // a near-identical second one is no use. That variety is better bought in the prompt,
  // which already sends the rejected beat and says to change what happens rather than
  // the wording: a temperature nobody else uses only makes this step's failures
  // different in kind from the rest.
  SCENE_BEAT: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 500 },
  // One beat, so the same small ceiling as SCENE_BEAT. `numCtx` is NOT small: this step
  // reads the previous scene in full — roughly 750 words of prose — on top of the Bible.
  NEXT_SCENE: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 16384, maxTokens: 500 },
  // Picking from a list, not writing. Low temperature: two runs of the same beat
  // should ask for the same things, or the scene stops being reproducible.
  SCENE_CONTEXT: { temperature: 0.2, repeatPenalty: 1.05, numCtx: 8192, maxTokens: 400 },
  // `maxTokens` has to be well above the target word count: 1,800 tokens ≈ 1,000
  // words, only a third above the 750 target — a model writing thoroughly hits the
  // ceiling and gets cut off. 2,600 tokens ≈ 1,450 words, room for a generous 900-word scene.
  //
  // `repeatPenalty` lowered from 1.12 to 1.05: a heavy repetition penalty also
  // crushes DELIBERATE repetition, which is a real device — "A knock. Then another knock."
  //
  // `temperature` 1.0 and `minP` 0.1 are what MS3.2-24B-Magnum-Diamond's model card asks
  // for, and they are a pair rather than two numbers: minP cuts the tail by ratio to the
  // likeliest token, so it tightens where the model is sure and loosens where it is not,
  // which is what makes the higher temperature safe. Measured on that model, minP 0.1
  // removed invented words outright.
  //
  // They apply to whatever model is active, OpenRouter included — params belong to a
  // STEP, not to a model. That is deliberate here: the pairing is not specific to one
  // finetune, and 0.1 is mild enough that a large cloud model barely notices it.
  WRITE_SCENE: { temperature: 1.0, minP: 0.1, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 2600 },
  // Lower than writing a scene: this is a correction, not an invention, and the one
  // thing it must not do is drift from the prose it has to join onto at both ends.
  // `maxTokens` is generous against the passage itself because "add more detail" is the
  // commonest note, and a ceiling near the original length would forbid obeying it.
  REVISE_PASSAGE: { temperature: 0.8, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 1600 },
  // Lower than scene writing because the plot is already fixed, higher than audio
  // editing because it is still prose: 0.4 gives a flat translation that reads like a news bulletin.
  //
  // `maxTokens` 6000, not the 2600 every other step uses, and the difference is not
  // caution. This step's output is the INPUT rendered again, so its size is set by the
  // scene rather than by how much the model feels like writing — and Vietnamese costs
  // more tokens than the English it comes from. Measured: a 985-word scene produced
  // 2,334 output tokens, 90% of the old ceiling, so roughly 2.4 tokens per source word.
  //
  // The longest scene in this repo is 1,988 words — revisions and a model that overruns
  // SCENE_MAX_WORDS both push past 900 — which needs about 4,800. 6000 covers 2,500
  // source words. Being wrong downwards costs a whole generation and a job that fails
  // after a minute of work; being wrong upwards costs nothing, because a translation
  // stops when the scene does.
  TRANSLATE: { temperature: 0.7, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 6000 },
  AUDIO_EDIT: { temperature: 0.4, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 12000 },
  SUMMARIZE: { temperature: 0.2, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 2500 },
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
 * markedly more closely.
 *
 * The NAMES are English too. They used to be Vietnamese, because `name` is the label
 * a listener reads; the Player still shows it, so a Vietnamese story currently carries
 * an English genre on its page and in the RSS keywords — to be dealt with on the
 * Player side, not by renaming back.
 *
 * `promptName` therefore appears only where it says something the name does not, and
 * a blank one falls back to `name`. Whatever the language, a name is the lookup key
 * (`Series.genre`, `Series.tags`, `Prompt.genre`): renaming one silently strips the
 * description from the Bible of every story still on the old name, so a rename means
 * rewriting those columns in the same breath — see scripts/rename-genres-en.mts.
 */
async function seedGenres() {
  const genres = [
    {
      name: "horror",
      description:
        "Fear comes from what cannot be explained, not from gore. Keep the pace slow: lay down ordinary, everyday detail first, then let one detail go wrong. No jump scares.",
    },
    {
      name: "romance",
      description:
        "The subject is a relationship between two people, and how it changes. Feeling shows through action and through silence, not through long interior monologue. Avoid sentimentality and dialogue that explains itself.",
    },
    {
      // Vietnamese readers search for this one as "đam mỹ" and for the next as
      // "bách hợp". Worth remembering when the Player gets its own labels: these
      // two lose more than the others by being listed in English.
      name: "danmei",
      promptName: "danmei / male-male romance",
      description:
        "A romance between two men, written as a romance: nobody in the scene has to justify it to the listener, and the story is not about it being unusual. Give the two of them different registers — the commonest failure is two voices a listener cannot tell apart, which is fatal in audio where there is no name at the top of the line. What keeps them apart should be something one of them chose — a duty, a lie, a debt — rather than a disapproving world doing the work. Neither of them is the woman in the pair.",
    },
    {
      name: "yuri",
      promptName: "yuri / female-female romance",
      description:
        "A romance between two women, and the listener must never be left wondering whether it is one — the commonest failure is a story that stays close enough to friendship to deny at the end. The closeness builds through proximity and habit: shared work, shared rooms, being the first person told. Let the turn be something one of them DOES that only makes sense if she is in love, rather than a speech announcing it. The desire is hers, not arranged for someone watching.",
    },
    {
      name: "detective",
      promptName: "detective fiction",
      description:
        "The listener must be given enough clues to work it out. Never withhold a fact just to reveal it at the last minute. Each episode closes one small question and opens a larger one.",
    },
    {
      name: "slice of life",
      description:
        "Nothing dramatic happens. The weight sits in small detail and in what the characters do not say. Keep the tone level and let the listener see it for themselves.",
    },
    {
      name: "fantasy",
      description:
        "The supernatural must run on clear rules, and those rules must never be broken to get a character out of a corner. Show the rules through scenes, not through narration.",
    },
    {
      name: "action",
      description:
        "Action is told through what a body can and cannot do, not through adjectives. Short sentences while it is happening; every fight costs something that lasts past the scene. Somebody has to want something badly enough to risk being hurt for it — a chase nobody needs is furniture.",
    },
    {
      name: "drama",
      description:
        "The conflict is between people who both have a case. Nobody is simply wrong, and the scene turns on what someone finally admits or refuses to. Keep events ordinary and let the pressure come from the relationship rather than from an outside threat.",
    },
    {
      name: "family drama",
      description:
        "Old debts inside one household: what was said years ago, and who still keeps score. Characters speak around the subject far more often than about it. A reconciliation must cost something, and it does not settle everything.",
    },
    {
      // "smut" is the word the audience this is for actually uses, in either
      // language. One word to change here — but only alongside the columns that
      // point at it; see the note above the list.
      name: "erotica",
      description:
        "The relationship is carried THROUGH physical intimacy rather than around it, so a scene that cuts away at the door has cut away from the story. Write desire the way horror writes fear: through what a body does before its owner decides to, what someone keeps noticing and cannot stop noticing, what they will not say out loud. Everyone involved is an adult and wants to be there, and that is shown inside the scene rather than assumed outside it. Anticipation carries further than description — a scene that is only choreography reads as a list.",
    },
    {
      name: "dark fantasy",
      description:
        "Magic costs something, and the cost is paid on screen — someone is worse off for having used it, including whoever won. Keep ordinary life visible: dread in a world where everything is already terrible has nothing to push against. Nobody is evil for its own sake; the frightening ones want something a listener recognises.",
    },
    {
      name: "wuxia",
      description:
        "How someone fights says what they are — restraint, cruelty, showing off — so a fight is a scene about people, not choreography. Forms of address carry the whole hierarchy and must stay exact: sư phụ, sư huynh, tiền bối, vãn bối. Debt, oath and face drive the story more often than the blade does, and a duel that settles nothing between two people is furniture.",
    },
    {
      name: "xianxia",
      promptName: "xianxia (cultivation fantasy)",
      description:
        "Progress IS the plot, so the listener must always know which rung the character stands on and what the next one costs — years, pills, a thing given up. The ladder has to hold: a breakthrough that arrives because the scene needed one spends every stake the story had. Heaven, fate and karma act; they are not scenery.",
    },
    {
      name: "science fiction",
      description:
        "One thing differs from our world and everything else follows from it. The story is what people DO about that difference, never the difference itself — explain nothing a character would find ordinary, the way nobody explains a lift. The technology must be able to fail, and it should.",
    },
    {
      name: "post-apocalyptic",
      description:
        "What is missing is more vivid than what is left: name the specific absence — no antibiotics, nobody alive who remembers how the dam worked. The disaster is over and this is about after, so no flashbacks explaining it. Ordinary objects become currency, and the cruelty is practical rather than gleeful.",
    },
    {
      name: "thriller",
      description:
        "The listener knows something a character does not, and the waiting is the pleasure. Pace with information rather than with running: withhold one fact, pay it off, open another. Nobody survives on luck — the danger is earned by someone being good at their job, the person causing it included.",
    },
    {
      name: "western setting",
      promptName: "a European or North American setting",
      description:
        "Set in Europe or North America, and the setting has to hold: names, money, food and work all come from one real place rather than half from there and half from home. Forms of address are the hard part — Vietnamese kinship pronouns import a hierarchy these characters do not live under, so choose the register deliberately and keep it. Disagreement is said to someone's face, not routed through a third person. Do not tour the landmarks; the detail that convinces is ordinary.",
    },
    {
      name: "east asian setting",
      description:
        "Pick ONE place — Việt Nam, Trung Hoa, Nhật Bản, Triều Tiên — and stay inside it; a blur of all four is the failure, and a listener from any of them hears it at once. Forms of address carry the hierarchy and must stay exact: they say who may speak first and who may not. The pressure comes from obligation and from face — what is owed to a family, what everyone knows and nobody will name. No scenery for its own sake: nothing here is exotic to the people living in it.",
    },
    {
      name: "comedy",
      description:
        "The comedy is in character, not in jokes: someone wants something reasonable and goes about it in a way nobody else would. Play it straight — a character who knows they are funny is not. Written to be HEARD, so the timing lives in sentence length and in pauses.",
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
      // `?? ""` rather than `g.promptName`: most entries no longer carry the field
      // at all, and `undefined` tells Prisma to leave the column alone — a genre
      // that had a promptName before would keep the old one for ever.
      update: OVERWRITE ? { description: g.description, promptName: g.promptName ?? "" } : {},
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
