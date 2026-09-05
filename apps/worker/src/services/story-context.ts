import { EPISODE_TARGET_WORDS } from "@audio/config";
import {
  mergeOverrides,
  parseEpisodeSetup,
  parseSceneSetup,
  parseWorld,
  renderEpisodeSetup,
  renderOverrides,
  seriesBible,
  type StoryBibleRecord,
} from "@audio/core";
import { Prisma, prisma } from "@audio/database";
import { openThreads, pinnedFacts, retrieveFacts } from "./fact-store";

export interface SceneContext {
  genre: string;
  /** Ngôn ngữ của bộ — thứ tiếng người nghe nhận được. */
  language: string;
  /** Viết bản thảo bằng tiếng này rồi mới chuyển ngữ. Rỗng = viết thẳng. */
  draftLanguage: string;
  bible: string;
  /** Tóm tắt cung truyện — các tập cũ đã nén lại. */
  arcSummary?: string;
  /** Tới hết tập số mấy thì `arcSummary` bao phủ. */
  arcThroughEpisode?: number;
  /** Mục lục truyện: mỗi tập một dòng. Luôn có, kể cả tập đã nén. */
  episodeIndex: Array<{ number: number; title: string; gist: string }>;
  /** Tóm tắt nguyên văn — chỉ tập liền trước, để nối mạch. */
  previousSummaries: Array<{ number: number; summary: string }>;
  /** Sự kiện cũ truy hồi theo ngữ nghĩa cho đúng beat này. */
  facts: Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>;
  /** Tình tiết bỏ ngỏ — luôn nạp, bất kể tương đồng. */
  openThreads: Array<{ episodeNumber: number; text: string }>;
  previousScene?: string;
  /** Khối chỉ dẫn riêng của chương, đã render. Rỗng nếu chương không đặt gì. */
  chapter: string;
  /** Ghi đè nhân vật cho đúng cảnh này — chương gộp với cảnh, cảnh thắng. */
  overrides: string;
  sceneNote: string;
  targetWords: number;
}

/**
 * Gom ngữ cảnh cho một lần viết cảnh — phân tầng để không tràn khi bộ dài ra.
 *
 * Bốn tầng, theo thứ tự từ ổn định nhất tới biến động nhất:
 *
 *   1. Story Bible      — thế giới, luật, nhân vật + TRẠNG THÁI hiện tại (cố định)
 *   2. Tóm tắt cung     — các tập cũ đã nén (trần ~400 từ)
 *   3. Tóm tắt gần đây  — RECENT_SUMMARY_COUNT tập gần nhất, nguyên văn
 *   4. Cảnh liền trước  — toàn văn, để nối mạch tự nhiên
 *
 * Không tầng nào tăng theo số tập, nên bộ 80 tập cũng vừa num_ctx. Bản trước
 * nạp TẤT CẢ tóm tắt và tràn quanh tập 35 — đo được bằng số thật.
 */
export async function buildSceneContext(sceneId: string): Promise<SceneContext> {
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      episode: {
        include: {
          series: { include: { characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }] } } },
        },
      },
    },
  });

  const { episode } = scene;
  const { series } = episode;

  const bible = await renderBibleFor(series);

  // Mục lục: mỗi tập một dòng ~15 từ. Rẻ, và là thứ duy nhất còn lại của các
  // tập đã bị nén — không có nó thì hệ thống "quên" là tập đó từng tồn tại.
  const indexRows = await prisma.episode.findMany({
    where: { seriesId: series.id, number: { lt: episode.number }, gist: { not: null } },
    orderBy: { number: "asc" },
    select: { number: true, title: true, gist: true },
  });

  // Chỉ tóm tắt ĐẦY ĐỦ của tập liền trước. Các tập xa hơn không nạp nguyên
  // khối nữa — thay bằng truy hồi sự kiện đúng thứ beat này cần.
  const previous = await prisma.episode.findFirst({
    where: { seriesId: series.id, number: episode.number - 1, summary: { not: null } },
    select: { number: true, summary: true },
  });

  // Truy hồi bằng vector, có ngưỡng tương đồng — không lấy top-K vô điều kiện.
  const [retrieved, threads, pinned] = await Promise.all([
    retrieveFacts({ seriesId: series.id, beforeEpisode: episode.number, query: scene.beat }),
    openThreads({ seriesId: series.id, beforeEpisode: episode.number }),
    pinnedFacts(series.id, episode.number),
  ]);

  // Sự kiện được ghim đứng cùng sự kiện truy hồi, đánh dấu similarity = 1.
  const facts = [
    ...pinned.map((p) => ({ ...p, kind: String(p.kind), similarity: 1 })),
    ...retrieved.filter((r) => !pinned.some((p) => p.text === r.text)),
  ];

  const previousScene =
    scene.order > 1
      ? await prisma.scene.findFirst({
          where: { episodeId: episode.id, order: scene.order - 1 },
          select: { text: true },
        })
      : null;

  const sceneCount = await prisma.scene.count({ where: { episodeId: episode.id } });

  // Ba tầng chỉ dẫn về nhân vật: Story Bible (cả bộ) → chương → cảnh. Gộp theo
  // TỪNG Ô nên cảnh chỉ cần nói phần khác đi.
  const chapterSetup = parseEpisodeSetup(episode.setup);
  const sceneSetup = parseSceneSetup(scene.setup);

  return {
    genre: series.genre,
    language: series.language,
    draftLanguage: series.draftLanguage,
    bible,
    arcSummary: series.arcSummary ?? undefined,
    arcThroughEpisode: series.arcThroughEpisode ?? undefined,
    episodeIndex: indexRows.map((e) => ({ number: e.number, title: e.title, gist: e.gist! })),
    previousSummaries: previous ? [{ number: previous.number, summary: previous.summary! }] : [],
    facts,
    openThreads: threads,
    previousScene: previousScene?.text ?? undefined,
    chapter: renderEpisodeSetup(chapterSetup),
    overrides: renderOverrides(mergeOverrides(chapterSetup.characters, sceneSetup.characters)),
    sceneNote: sceneSetup.note,
    targetWords: Math.round(EPISODE_TARGET_WORDS / Math.max(1, sceneCount)),
  };
}

type SeriesForBible = Prisma.SeriesGetPayload<{ include: { characters: true } }>;

/**
 * Dựng Story Bible từ dữ liệu MỚI NHẤT của bộ, không dùng bản đã render sẵn.
 *
 * Người viết có thể vừa sửa luật thế giới hoặc thêm nhân vật ở Studio; dùng bản
 * cache cũ thì cảnh viết ra sẽ trái với thứ vừa sửa.
 */
async function renderBibleFor(series: SeriesForBible): Promise<string> {
  const stored = (series.storyBible ?? {}) as StoryBibleRecord;

  // Mô tả của đúng những thể loại bộ này dùng. Một truy vấn, đổi lại model
  // hiểu "kinh dị" theo nghĩa người viết định.
  const genreNotes = await prisma.genre.findMany({
    where: { name: { in: [series.genre, ...series.tags] } },
    select: { name: true, description: true },
  });

  return seriesBible({
    title: series.title,
    genre: series.genre,
    tags: series.tags,
    genreNotes,
    description: series.description,
    world: parseWorld(stored.world),
    characters: series.characters,
    episodes: stored.raw?.episodes,
  });
}

/**
 * Story Bible của một bộ, cho bước chỉ cần Bible chứ không cần cả ngữ cảnh cảnh.
 *
 * Bước chuyển ngữ là ca dùng: nó cần tên riêng, thuật ngữ và cách xưng hô, mà
 * KHÔNG được nhìn tóm tắt hay sự kiện cũ — cho nó ngữ cảnh câu chuyện là mời nó
 * kể lại cho hay hơn, trong khi việc của nó là giữ nguyên từng tình tiết.
 */
export async function buildSeriesBible(seriesId: string): Promise<string> {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    include: { characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }] } },
  });
  return renderBibleFor(series);
}
