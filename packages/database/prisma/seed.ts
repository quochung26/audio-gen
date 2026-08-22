import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient, PromptStep, TtsEngine, VoiceTier, LicenseType } from "@prisma/client";

const prisma = new PrismaClient();

/** Thư mục prompts/ ở gốc repo, so với packages/database/prisma/ */
const PROMPTS_DIR = join(import.meta.dirname, "../../../prompts");

/**
 * `model` để trống nghĩa là dùng model theo cấu hình cho bước đó. Trước đây ba
 * bước phụ ghi "utility" — đó KHÔNG phải tên model nào cả, và giờ job đọc
 * `Prompt.model` thật nên để vậy là gọi Ollama với model tên "utility".
 */
const PROMPT_FILES: Array<{ step: PromptStep; file: string; model?: string }> = [
  { step: "OUTLINE", file: "outline.md" },
  { step: "WRITE_SCENE", file: "write-scene.md" },
  { step: "AUDIO_EDIT", file: "audio-edit.md" },
  { step: "SUMMARIZE", file: "summarize.md" },
  { step: "ARC_SUMMARY", file: "arc-summary.md" },
  { step: "METADATA", file: "metadata.md" },
];

/** Tham số sinh theo từng bước — văn sáng tạo cần temperature cao hơn việc phụ. */
const PARAMS: Partial<Record<PromptStep, Record<string, number>>> = {
  OUTLINE: { temperature: 0.9, repeatPenalty: 1.1, numCtx: 8192, maxTokens: 2500 },
  WRITE_SCENE: { temperature: 0.95, repeatPenalty: 1.12, numCtx: 16384, maxTokens: 1800 },
  AUDIO_EDIT: { temperature: 0.4, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 4000 },
  SUMMARIZE: { temperature: 0.5, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 900 },
  ARC_SUMMARY: { temperature: 0.4, repeatPenalty: 1.05, numCtx: 16384, maxTokens: 800 },
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
        note: `Nạp từ prompts/${file}`,
      },
    });
  }
  console.log(`✔ ${PROMPT_FILES.length} prompt`);
}

/**
 * Giọng giả lập để pipeline chạy được trước khi có Kokoro thật.
 * Giọng thật thêm ở Phase 3 bằng scripts/seed-voices.
 */
async function seedVoices() {
  // Mỗi thứ tiếng phải có bộ giọng riêng: giọng sai tiếng bị bộ giải giọng bỏ
  // qua, nên thiếu là truyện tiếng Anh không dựng được audio dù đang chạy giả
  // lập. Xem apps/worker/src/services/voice-resolver.ts.
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
      // Cập nhật `language` cả với hàng đã có: bản trước chưa có cột này nên
      // mọi giọng cũ đều mang giá trị mặc định "vi".
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
  console.log(`✔ ${voices.length} giọng giả lập (vi + en)`);
}

/** Từ điển phát âm chung — những thứ TTS tiếng Việt hay đọc sai. */
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
  console.log(`✔ ${fresh.length} từ điển phát âm mới (đã có ${have.size})`);
}

async function main() {
  await seedPrompts();
  await seedVoices();
  await seedPronunciations();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
