import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { Bible } from "./Bible";
import { Characters } from "./Characters";
import { Dashboard } from "./Dashboard";
import { Episode } from "./Episode";
import { EpisodeAudio } from "./EpisodeAudio";
import { Facts } from "./Facts";
import { Genres } from "./Genres";
import { Job } from "./Job";
import { Models } from "./Models";
import { Prompt } from "./Prompt";
import { Prompts } from "./Prompts";
import { Series } from "./Series";
import { Stats } from "./Stats";
import { SeriesList } from "./SeriesList";
import { SeriesNew } from "./SeriesNew";
import { Tracks } from "./Tracks";

/**
 * Checks every page renders with REALISTICALLY-SHAPED data from the API.
 *
 * This is the safety net from the Next-to-Vite move: TypeScript catches wrong
 * types, but not `data.x.y` when `x` is an empty array or null. That kind of
 * failure only shows on opening the page, and opening 13 pages by hand misses
 * one every time.
 */

/** Fixture data per endpoint — shapes match the routes in apps/api. */
const FIXTURES: Record<string, unknown> = {
  "/api/jobs": {
    recent: [
      {
        id: "j1",
        status: "DONE",
        lane: "LLM",
        type: "OUTLINE",
        vramMb: 12288,
        progress: 100,
        startedAt: "2026-08-18T07:00:00Z",
        finishedAt: "2026-08-18T07:00:05Z",
        episode: { id: "e1", number: 1, title: "Tập 1" },
      },
    ],
    byStatus: [{ status: "QUEUED", _count: 2 }],
    vram: { usableMb: 14336, totalMb: 16384, reservedMb: 2048 },
    // Enough old rows for the cleanup panel to render — it hides itself when there is
    // nothing to remove, so a zero here would test the empty case only.
    history: { jobs: 143, runs: 238, prunableJobs: 40, prunableRuns: 61, keepDays: 30 },
  },
  "/api/jobs/j1": {
    id: "j1",
    type: "OUTLINE",
    status: "RUNNING",
    lane: "LLM",
    vramMb: 12288,
    progress: 42,
    error: null,
    episodeId: null,
    result: null,
  },
  // The shape `GET /api/series` really returns: the whole Series row plus `_count`.
  // It was trimmed to the four fields the list happened to read, so adding a fifth
  // crashed the page with `undefined` rather than failing an assertion.
  "/api/series": [
    {
      id: "s1",
      title: "Đường về",
      description: "mô tả",
      coverUrl: null,
      genre: "kinh dị",
      status: "ONGOING",
      updatedAt: new Date().toISOString(),
      _count: { episodes: 3, characters: 2 },
    },
  ],
  "/api/series/genres": ["kinh dị"],
  "/api/genres": {
    genres: [
      {
        id: "g1",
        name: "kinh dị",
        description: "Sợ đến từ thứ không giải thích được.",
        enabled: true,
        usedBy: 3,
      },
      { id: "g2", name: "kỳ ảo", description: "Siêu nhiên phải có luật.", enabled: false, usedBy: 0 },
      {
        id: "g3",
        name: "trinh thám",
        description: "Người nghe phải đủ manh mối để tự đoán ra.",
        enabled: true,
        usedBy: 2,
      },
    ],
    unlisted: [{ name: "slow burn", usedBy: 1 }],
  },
  "/api/series/s1/episodes": { jobId: "j-new" },
  "/api/series/s1/tags": { ok: "Saved 2 sub-genres." },
  "/api/series/s1": {
    id: "s1",
    title: "Đường về",
    description: "mô tả",
    genre: "kinh dị",
    tags: ["tình cảm", "slow burn"],
    language: "en",
    model: "qwen3:32b",
    kind: "LONG",
    world: { setting: "", tone: "", rules: [], constraints: [], glossary: [] },
    characters: [
      {
        id: "c1",
        name: "Tài",
        role: "tài xế",
        description: null,
        isNarrator: true,
        voiceHint: null,
        voice: null,
      },
    ],
    episodes: [
      {
        id: "e1",
        number: 1,
        title: "Tập 1",
        status: "READY",
        humanReviewed: true,
        wordCount: 2500,
        durationMs: 1200000,
        // `chapters`, not `scenes`: what /api/series/:id actually counts. The fixture
        // said `scenes` and nothing noticed, because nothing read it until now.
        _count: { chapters: 2, blocks: 12 },
        exports: [{ id: "x1" }],
      },
    ],
    batchRuns: [],
    finaleFrom: null,
    ending: {
      verdict: { kind: "open" },
      wouldBlock: [],
      facts: { episodes: 1, unapproved: 0, unwritten: 0, openThreads: 0 },
    },
  },
  "/api/series/s1/world": {
    world: { setting: "bối cảnh", tone: "", rules: ["luật 1"], constraints: [], glossary: [] },
    bible: "## Thế giới\nluật 1",
    title: "Đường về",
  },
  "/api/series/s1/characters": {
    characters: [
      {
        id: "c1",
        name: "Tài",
        role: "tài xế",
        description: null,
        state: "Đang ở nhà bà goá, bên kia cầu cũ.",
        stateThroughEpisode: 2,
        voiceHint: null,
        isNarrator: true,
        voiceId: null,
        voice: null,
        _count: { blocks: 0 },
      },
    ],
    voices: [{ id: "v1", name: "Giọng nam", engine: "kokoro", tier: "FAST", commercialOk: true }],
    defaultVoiceId: null,
    title: "Đường về",
  },
  "/api/series/s1/facts": {
    facts: [
      {
        id: "f1",
        kind: "OPEN_THREAD",
        text: "Tài chưa biết ai gửi vé",
        episodeNumber: 1,
        pinned: false,
        resolved: false,
        resolvedInEpisode: null,
      },
    ],
    missingVector: 0,
    title: "Đường về",
  },
  "/api/episodes/e1": {
    id: "e1",
    seriesId: "s1",
    number: 1,
    title: "Tập 1",
    status: "DRAFTED",
    wordCount: 2500,
    durationMs: null,
    summary: null,
    humanReviewed: false,
    reviewedAt: null,
    series: {
      id: "s1",
      title: "Đường về",
      language: "vi",
      draftLanguage: "",
      model: "qwen3:32b",
      characters: [{ id: "c1", name: "Tài", isNarrator: true }],
    },
    chapters: [
      {
        id: "ch1",
        order: 1,
        title: "Đêm đầu tiên",
        setup: null,
        endsAtScene: null,
        scenes: [
          {
            id: "sc1",
            order: 1,
            beat: "mở đầu",
            text: "Trời tối.",
            sourceText: null,
            storySoFar: "Tài nhận chuyến xe đêm cuối cùng ở bến Sài Gòn.",
            revisions: [],
            characterIds: [],
            setup: null,
          },
        ],
      },
    ],
    blocks: [],
    renderJobs: [],
  },
  "/api/episodes/e1/audio": {
    episode: {
      id: "e1",
      number: 1,
      title: "Tập 1",
      status: "READY",
      durationMs: 1200000,
      publishedAt: null,
      bgmTrackId: null,
      bgmVolume: 0.18,
      bgmTrack: null,
      series: { id: "s1", title: "Đường về" },
      blocks: [
        {
          id: "b1",
          order: 1,
          speakerLabel: "narrator",
          voiceId: "v1",
          ttsEngine: "MOCK",
          text: "Trời tối.",
          approved: false,
          audioAsset: { id: "a1", url: "series/s1/blocks/x.wav", durationMs: 3000, refCount: 1 },
          character: null,
        },
      ],
      exports: [
        { id: "x1", url: "series/s1/episodes/t1.mp3", durationMs: 1200000, sizeBytes: 400000, bitrateKbps: 160, lufs: -16 },
      ],
      renderJobs: [],
    },
    bgmTracks: [
      { id: "t1", title: "Nhạc nền", mood: "u ám", durationMs: 60000, licenseType: "CC0" },
    ],
  },
  "/api/tracks": {
    tracks: [
      {
        id: "t1",
        title: "Nhạc nền",
        kind: "BGM",
        url: "library/bgm/x.mp3",
        durationMs: 60000,
        mood: "u ám",
        tags: ["piano"],
        licenseType: "UNKNOWN",
        licenseNote: null,
        attribution: null,
        _count: { episodesAsBgm: 0 },
      },
    ],
    storageDriver: "local",
  },
  // Settings only — the Ollama probe is its own request now, so that the Models page
  // renders without waiting on another machine.
  "/api/models": {
    url: "http://localhost:11434",
    provider: "ollama",
    embedProvider: "mock",
    sceneContext: "full",
    recent: ["qwen3:8b"],
    language: { value: "vi", fromEnv: true },
    configured: [
      { label: "Writing", kind: "write", value: "qwen3:14b", source: "installed", model: "qwen3:14b" },
      { label: "Utility — summaries, metadata", kind: "utility", value: "qwen3:8b", source: "setting", model: "qwen3:8b" },
    ],
    promptOverrides: [{ label: "Prompt WRITE_SCENE", model: "qwen3:32b" }],
    pull: {
      model: "qwen3:14b-q4_K_M",
      status: "downloading",
      completedBytes: 3_000_000_000,
      totalBytes: 9_000_000_000,
      done: false,
      error: null,
      elapsedMs: 45_000,
    },
  },
  "/api/models/ollama": {
    reachable: true,
    reason: null,
    version: "0.5.0",
    installed: [
      {
        name: "qwen3:8b",
        sizeBytes: 5_200_000_000,
        parameterSize: "8.2B",
        quantization: "Q4_K_M",
        modifiedAt: "2026-08-01T00:00:00Z",
      },
    ],
  },
  "/api/models/openrouter": {
    hasKey: true,
    reachable: true,
    reason: null,
    key: { usage: 2.5, limit: 10, remaining: 7.5, freeTier: false },
    url: "https://openrouter.ai/api/v1",
    active: false,
    // Real numbers measured over 20 episodes run on this machine.
    usage: { episodes: 20, inputTokens: 3820, outputTokens: 1718 },
  },
  "/api/models/openrouter/models": {
    cached: false,
    models: [
      {
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        contextLength: 200000,
        promptPerMTok: 3,
        completionPerMTok: 15,
        free: false,
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        name: "Llama 3.3 70B (free)",
        contextLength: 131072,
        promptPerMTok: 0,
        completionPerMTok: 0,
        free: true,
      },
    ],
  },
  "/api/stats": {
    users: 12,
    totals: { episodes: 2, listeners: 30, finished: 9, favorites: 5, comments: 4, pending: 2 },
    episodes: [
      {
        id: "e1",
        number: 1,
        title: "Tập 1",
        durationMs: 1_200_000,
        publishedAt: "2026-08-18T07:00:00Z",
        series: { title: "Đường về", slug: "duong-ve" },
        listeners: 20,
        avgCompletion: 82.4,
        finished: 7,
        rating: 4.5,
        ratingCount: 8,
        favorites: 4,
        commentsApproved: 2,
        commentsPending: 2,
      },
      {
        id: "e2",
        number: 2,
        title: "Tập 2",
        durationMs: 1_200_000,
        publishedAt: "2026-08-18T08:00:00Z",
        series: { title: "Đường về", slug: "duong-ve" },
        listeners: 10,
        avgCompletion: 18.2,
        finished: 2,
        rating: null,
        ratingCount: 0,
        favorites: 1,
        commentsApproved: 0,
        commentsPending: 0,
      },
    ],
  },
  "/api/prompts": {
    prompts: [
      {
        id: "p1",
        step: "WRITE_SCENE",
        genre: "*",
        version: 1,
        active: true,
        note: "default",
        content: "{{context}}",
        wins: true,
        params: { temperature: 0.95, numCtx: 16384 },
        unknownParams: [],
      },
    ],
    steps: ["OUTLINE", "WRITE_SCENE", "STORY_SO_FAR", "AUDIO_EDIT", "SUMMARIZE", "METADATA"],
    // The spec table comes from the API — Studio never copies the ranges.
    genParams: [
      { key: "temperature", label: "temperature", hint: "Higher is more varied but wanders off topic.", min: 0, max: 1.5, step: 0.05, fallback: 0.9 },
      { key: "topP", label: "topP", hint: "Lower is safer and flatter.", min: 0.1, max: 1, step: 0.01, fallback: 0.92 },
      { key: "repeatPenalty", label: "repeatPenalty", hint: "Penalises repeated phrases.", min: 1, max: 1.5, step: 0.01, fallback: 1.1 },
      { key: "numCtx", label: "numCtx", hint: "Context ceiling.", min: 2048, max: 131072, step: 1024, fallback: 16384 },
      { key: "maxTokens", label: "maxTokens", hint: "Ceiling on answer length.", min: 128, max: 32768, step: 128, fallback: 1500 },
    ],
  },
  "/api/prompts/p1": {
    prompt: {
      id: "p1",
      step: "WRITE_SCENE",
      genre: "*",
      version: 1,
      active: true,
      content: "{{context}}",
      model: null,
      note: null,
      params: { temperature: 0.95 },
      unknownParams: ["top_k"],
      updatedAt: "2026-08-18T07:00:00Z",
    },
    // The spec table comes from the API — Studio never copies the ranges.
    genParams: [
      { key: "temperature", label: "temperature", hint: "Higher is more varied but wanders off topic.", min: 0, max: 1.5, step: 0.05, fallback: 0.9 },
      { key: "topP", label: "topP", hint: "Lower is safer and flatter.", min: 0.1, max: 1, step: 0.01, fallback: 0.92 },
      { key: "repeatPenalty", label: "repeatPenalty", hint: "Penalises repeated phrases.", min: 1, max: 1.5, step: 0.01, fallback: 1.1 },
      { key: "numCtx", label: "numCtx", hint: "Context ceiling.", min: 2048, max: 131072, step: 1024, fallback: 16384 },
      { key: "maxTokens", label: "maxTokens", hint: "Ceiling on answer length.", min: 128, max: 32768, step: 128, fallback: 1500 },
    ],
    wins: true,
    check: { used: ["context"], unknown: [], unused: [] },
    available: ["context"],
    runs: 18,
  },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const path = String(input).split("?")[0]!;
      const body = FIXTURES[path];
      if (body === undefined) {
        return Promise.resolve(new Response(JSON.stringify({ error: "missing fixture: " + path }), { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
  // jsdom has none; the audio page uses window.confirm in its delete button.
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string, route: string, element: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PAGES: Array<[string, string, string, ReactElement, string]> = [
  ["Dashboard", "/", "/", <Dashboard />, "Dashboard"],
  ["Story list", "/series", "/series", <SeriesList />, "Đường về"],
  ["New story", "/series/new", "/series/new", <SeriesNew />, "Idea"],
  ["Story", "/series/s1", "/series/:id", <Series />, "Batch run"],
  ["Story Bible", "/series/s1/bible", "/series/:id/bible", <Bible />, "World rules"],
  ["Characters", "/series/s1/characters", "/series/:id/characters", <Characters />, "Default voice"],
  ["Facts", "/series/s1/facts", "/series/:id/facts", <Facts />, "Open threads"],
  ["Episode", "/episode/e1", "/episode/:id", <Episode />, "Approve the draft"],
  ["Episode audio", "/episode/e1/audio", "/episode/:id/audio", <EpisodeAudio />, "Music level"],
  ["Job", "/job/j1", "/job/:id", <Job />, "OUTLINE"],
  ["Music library", "/tracks", "/tracks", <Tracks />, "Music library"],
  ["Prompts (list)", "/prompts", "/prompts", <Prompts />, "Write scene"],
  ["Prompt (edit)", "/prompts/p1", "/prompts/:id", <Prompt />, "Available variables"],
  ["Models", "/model", "/model", <Models />, "Quantisation"],
  ["Stats", "/stats", "/stats", <Stats />, "By episode"],
];

describe("every page renders", () => {
  it.each(PAGES)("%s", async (_name, path, route, element, expected) => {
    renderAt(path, route, element);
    await waitFor(() => expect(screen.getByText(new RegExp(expected))).toBeDefined());
  });
});

describe("the dashboard offers to clean up its own history", () => {
  it("says how many rows go, and that failures stay", async () => {
    // A "clean up" button that does not say what it removes is a dare. And the two
    // exceptions are the point of the feature: a failure is the row somebody goes
    // looking for, and a rating is a judgement recorded nowhere else.
    // `container.textContent`, not getByText: the sentence is stitched from four JSX
    // interpolations, so no single text node holds it.
    const { container } = renderAt("/", "/", <Dashboard />);
    await waitFor(() => expect(screen.getByText(/Clean up history/)).toBeDefined());
    // 40 jobs + 61 runs — the panel reports the TOTAL that goes, not one of the two.
    expect(container.textContent).toContain("101 of them are finished and older than 30 days");
    expect(container.textContent).toContain("143 jobs and 238 model runs recorded");
    expect(container.textContent).toContain("Failures and anything you rated stay");
  });
});

describe("pages surface the warnings that matter", () => {
  it("the music library warns about tracks with no verified licence", async () => {
    renderAt("/tracks", "/tracks", <Tracks />);
    await waitFor(() =>
      expect(screen.getByText(/no verified licence/)).toBeDefined(),
    );
  });

  it("an unapproved episode shows the gate and NOT the build-script button", async () => {
    renderAt("/episode/e1", "/episode/:id", <Episode />);
    await waitFor(() => expect(screen.getByText(/I have read it and approve/)).toBeDefined());
    expect(screen.queryByText(/build script/)).toBeNull();
  });

  it("the default prompt shows as in use and cannot be deleted", async () => {
    renderAt("/prompts/p1", "/prompts/:id", <Prompt />);
    await waitFor(() => expect(screen.getByText(/default — every genre/)).toBeDefined());
    expect(screen.getAllByText("in use").length).toBeGreaterThan(0);
    expect(screen.queryByText(/delete variant/)).toBeNull();
    expect(screen.getByText(/The default cannot be deleted/)).toBeDefined();
  });
});

describe("trang Model", () => {
  /**
   * Assert on the page's whole text rather than getByText: React splits
   * `{pct}%` into two text nodes, and the model name appears both in the
   * progress bar and in the command preview — getByText reports "multiple
   * elements" while the page is perfectly fine.
   */
  async function pageText(): Promise<string> {
    const { container } = renderAt("/model", "/model", <Models />);
    await waitFor(() => expect(container.textContent).toContain("Quantisation"));
    return container.textContent ?? "";
  }

  it("shows download progress and the right percentage", async () => {
    const t = await pageText();
    expect(t).toContain("qwen3:14b-q4_K_M");
    expect(t).toContain("33%"); // 3 GB / 9 GB
    expect(t).toContain("3.0 GB");
    expect(t).toContain("9.0 GB");
    expect(t).toContain("45s so far");
  });

  it("says which default was chosen AUTOMATICALLY", async () => {
    // Unsaid, the user thinks they set that value themselves.
    expect(await pageText()).toContain("follows what is pulled");
  });

  it("offers ONE of the two places models can run", async () => {
    const t = await pageText();
    expect(t).toContain("Where models run");
    expect(t).toContain("Ollama — local");
    expect(t).toContain("OpenRouter — cloud");
    // The fixture runs Ollama, so the other side must offer a switch rather than
    // also reading "in use".
    expect(t).toContain("in use");
    expect(t).toContain("switch to OpenRouter");
  });

  it("previews the exact ollama command", async () => {
    // So it can be checked against Ollama's docs before clicking.
    expect(await pageText()).toContain("ollama pull qwen3:14b-q4_K_M");
  });

  it("says which default comes from .env and which was set by hand", async () => {
    // The difference: editing .env needs a worker restart, setting by hand does not.
    const t = await pageText();
    expect(t).toContain("from .env");
  });

  it("lists prompts with their own model — they IGNORE the defaults", async () => {
    const t = await pageText();
    expect(t).toContain("Prompt WRITE_SCENE");
    expect(t).toContain("These steps ignore the defaults");
  });

  it("spells out the three-level precedence", async () => {
    expect(await pageText()).toContain("the model picked for that run");
  });
});

describe("the Stats page", () => {
  async function text(): Promise<string> {
    const { container } = renderAt("/stats", "/stats", <Stats />);
    await waitFor(() => expect(container.textContent).toContain("By episode"));
    return container.textContent ?? "";
  }

  it("says it can only count SIGNED-IN listeners", async () => {
    // Unsaid, the number looks like total plays and every decision from it is
    // off.
    const t = await text();
    expect(t).toContain("signed-in");
    expect(t).toContain("a floor");
  });

  it("puts the most-listened episodes first", async () => {
    const t = await text();
    expect(t.indexOf("Tập 1")).toBeLessThan(t.indexOf("Tập 2"));
  });

  it("shows the listened percentage and the star rating", async () => {
    const t = await text();
    expect(t).toContain("82%");
    expect(t).toContain("4.5 (8)");
  });

  it("an unrated episode shows a dash, not 0 stars", async () => {
    // Showing "0.0 stars" for an unrated episode is a lie — quite different from being rated badly.
    expect(await text()).toContain("—");
  });

  it("flags how many comments are awaiting review", async () => {
    expect(await text()).toContain("2 comments awaiting review");
  });
});

describe("language", () => {
  it("the story page makes the story language obvious", async () => {
    // Language decides what the model writes and which voices can read it —
    // unshown, you open an English story thinking it is Vietnamese.
    const { container } = renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(container.textContent).toContain("Đường về"));
    expect(container.textContent).toContain("English");
  });

  it("the new-story screen has a language picker prefilled from the default", async () => {
    const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
    await waitFor(() => expect(container.textContent).toContain("Language"));
    const select = container.querySelector<HTMLSelectElement>('select[name="language"]');
    expect(select).toBeTruthy();
    expect(select!.value).toBe("vi");
    // Say it is final — changing language mid-story means rewriting from scratch.
    expect(container.textContent).toContain("cannot be changed later");
  });

  it("the Models page sets the default language for new stories", async () => {
    const { container } = renderAt("/model", "/model", <Models />);
    await waitFor(() => expect(container.textContent).toContain("Default language"));
    // Must say it does NOT touch existing stories.
    expect(container.textContent).toMatch(/not.*touch existing stories/);
  });
});

describe("generation parameters", () => {
  it("the settings page tunes parameters per step", async () => {
    const { container } = renderAt("/model", "/model", <Models />);
    await waitFor(() => expect(container.textContent).toContain("Generation parameters"));
    expect(container.textContent).toContain("WRITE_SCENE");
    expect(container.querySelector('input[name="temperature"]')).toBeTruthy();
    expect(container.querySelector('input[name="numCtx"]')).toBeTruthy();
  });

  it("the prompt page uses inputs, NOT a JSON box", async () => {
    // Mistyping a key in JSON said nothing — the parameter was quietly dropped
    // and prose still came out, just at the default value.
    const { container } = renderAt("/prompts/p1", "/prompts/:id", <Prompt />);
    await waitFor(() => expect(container.textContent).toContain("Generation parameters"));
    expect(container.querySelector('textarea[name="params"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[name="temperature"]')!.value).toBe("0.95");
    // Stray keys in old data are called out.
    expect(container.textContent).toContain("top_k");
  });
});

describe("when there is no model to pick", () => {
  /** Ollama down — by far the most common case. */
  function withoutOllama() {
    const base = FIXTURES["/api/models"] as Record<string, unknown>;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const path = String(input).split("?")[0]!;
        // "Ollama down" now lives in the probe's payload, not the settings one; the
        // empty `recent` still belongs to the settings half.
        const body =
          path === "/api/models"
            ? { ...base, recent: [] }
            : path === "/api/models/ollama"
              ? { reachable: false, reason: "Connection refused", version: null, installed: [] }
              : FIXTURES[path];
        return Promise.resolve(
          new Response(JSON.stringify(body ?? { error: "missing fixture" }), {
            status: body ? 200 : 404,
          }),
        );
      }),
    );
  }

  it("the Models page says there are NONE, with the reason and address", async () => {
    // It used to fall back silently to a text box — all you saw was "no model
    // picker", with no hint that Ollama was down.
    withoutOllama();
    const { container } = renderAt("/model", "/model", <Models />);
    await waitFor(() => expect(container.textContent).toContain("Default models"));
    expect(container.textContent).toContain("Nothing to pick");
    expect(container.textContent).toContain("http://localhost:11434");
    expect(container.textContent).toContain("ollama serve");
  });

  it("the new-story form says it too, instead of hiding the picker", async () => {
    withoutOllama();
    const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
    await waitFor(() => expect(container.textContent).toContain("Model for this run"));
    expect(container.textContent).toContain("Nothing to pick");
    // Still says what this run will use.
    expect(container.textContent).toContain("uses the default");
  });
});

describe("assigning models from the pulled list", () => {
  it("each model has buttons for writing / utility / embeddings", async () => {
    // This list used to have only a delete button: you could see the model you
    // had just pulled with no way to use it.
    const { container } = renderAt("/model", "/model", <Models />);
    await waitFor(() => expect(container.textContent).toContain("Models available"));
    for (const name of ["use for writing", "utility", "embeddings"]) {
      expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0);
    }
  });

  it("clicking sends the right model name for the right kind", async () => {
    const { container } = renderAt("/model", "/model", <Models />);
    await waitFor(() => expect(container.textContent).toContain("qwen3:8b"));
    fireEvent.click(screen.getAllByRole("button", { name: "use for writing" })[0]!);

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => String(c[0]) === "/api/models/default/write",
      );
      expect(call).toBeTruthy();
      expect((call![1] as { body: FormData }).body.get("model")).toBe("qwen3:8b");
    });
  });

  it("shows which model is currently used for what", async () => {
    // The fixture sets qwen3:8b as the utility model.
    const { container } = renderAt("/model", "/model", <Models />);
    await waitFor(() => expect(container.textContent).toContain("Models available"));
    expect(container.textContent).toContain("in use as: Utility");
  });
});

describe("one episode at a time", () => {
  it("the new-story screen no longer asks for an episode count", async () => {
    // Planning 10 episodes from one line of idea makes episode 8 onward the
    // model's guess about a story nobody has written yet.
    const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
    await waitFor(() => expect(container.textContent).toContain("Idea"));
    expect(container.querySelector('input[name="episodeCount"]')).toBeNull();
    expect(container.textContent).toContain("first episode");
    expect(container.textContent).toContain("New episode");
  });

  it("the story page has a New episode button hitting the right route", async () => {
    const { container } = renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(container.textContent).toContain("Đường về"));
    fireEvent.click(screen.getByRole("button", { name: "New episode" }));

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => String(c[0]) === "/api/series/s1/episodes",
      );
      expect(call).toBeTruthy();
      expect((call![1] as { method: string }).method).toBe("POST");
    });
  });
});

describe("sub-genres", () => {
  it("the new-story screen keeps sub-genres separate from the main genre", async () => {
    const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
    await waitFor(() => expect(container.textContent).toContain("Main genre"));
    expect(container.querySelector('input[name="tags"]')).toBeTruthy();
    // Say the two do different jobs, or they look redundant.
    expect(container.textContent).toMatch(/main\s+genre decides which prompt runs/i);
  });

  it("the story page shows sub-genres and lets you edit them", async () => {
    const { container } = renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(container.textContent).toContain("Đường về"));
    expect(container.textContent).toContain("slow burn");

    const input = container.querySelector<HTMLInputElement>('input[name="tags"]')!;
    expect(input.value).toBe("tình cảm, slow burn");
  });

  it("says editing here does NOT touch the main genre", async () => {
    const { container } = renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(container.textContent).toContain("Sub-genres"));
    expect(container.textContent).toMatch(/nothing here touches it/i);
  });
});

describe("the Genres page", () => {
  async function page() {
    const { container } = renderAt("/genres", "/genres", <Genres />);
    await waitFor(() => expect(container.textContent).toContain("Catalogue"));
    return container;
  }

  it("says the description is what the MODEL reads, not a note for humans", async () => {
    // Unsaid, people write dictionary definitions that steer nothing.
    const c = await page();
    expect(c.textContent).toMatch(/not a note for human readers/);
    expect(c.textContent).toMatch(/goes into\s+the Story Bible/);
  });

  it("shows how many stories use each genre", async () => {
    const c = await page();
    expect(c.textContent).toContain("used by 3");
    expect(c.textContent).toContain("unused");
  });

  it("does NOT offer delete for a genre in use", async () => {
    // Delete it and those stories lose their Bible description with nothing said.
    await page();
    expect(screen.getAllByRole("button", { name: "delete" })).toHaveLength(1);
  });

  it("marks hidden genres", async () => {
    expect((await page()).textContent).toContain("hidden");
  });

  it("lists genres in use that have no description", async () => {
    const c = await page();
    expect(c.textContent).toContain("slow burn");
    expect(c.textContent).toMatch(/not in the catalogue/);
  });
});

describe("the new-story screen takes genres from the catalogue", () => {
  it("lists only enabled genres", async () => {
    const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
    const options = () =>
      [...container.querySelectorAll('select[name="genre"] option')].map((o) => o.textContent);

    // Wait for the CONTENT, not for "any options yet": before the catalogue
    // arrives the select already holds one empty-state option, so counting
    // options waits for nothing. "kỳ ảo" is hidden and must not appear.
    await waitFor(() => expect(options()).toEqual(["kinh dị", "trinh thám"]));
  });

  it("an empty catalogue says so in one line rather than a blank select", async () => {
    // A select with no options opens a blank list — it looks broken.
    const { container } = await withEmptyCatalog(async () => {
      const r = renderAt("/series/new", "/series/new", <SeriesNew />);
      await waitFor(() => expect(r.container.textContent).toContain("The genre catalogue is empty"));
      return r;
    });

    const select = container.querySelector<HTMLSelectElement>('select[name="genre"]')!;
    expect([...select.options].map((o) => o.textContent)).toEqual(["— no genres yet —"]);
    expect(select.disabled).toBe(true);
  });
});

describe("picking sub-genres", () => {
  it("allows several, and sends one comma-separated string", async () => {
    const { container } = renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "trinh thám" })).toBeTruthy());
    const tags = () => container.querySelector<HTMLInputElement>('input[name="tags"]')!.value;

    fireEvent.click(screen.getByRole("checkbox", { name: "trinh thám" }));
    expect(tags()).toBe("tình cảm, slow burn, trinh thám");

    fireEvent.click(screen.getByRole("checkbox", { name: "tình cảm" }));
    expect(tags()).toBe("slow burn, trinh thám");
  });

  it("a genre the story carries but the catalogue lacks still shows, still ticked", async () => {
    // Drop them and one Save wipes them, with nothing said.
    renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "slow burn" })).toBeInstanceOf(HTMLInputElement),
    );
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "slow burn" }).checked).toBe(true);
  });

  it("does not offer the main genre — a story is not a sub-genre of itself", async () => {
    renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "trinh thám" })).toBeTruthy());
    // "kinh dị" is this story's main genre and is in the catalogue, so before
    // this it sat in the list waiting to be ticked a second time.
    expect(screen.queryByRole("checkbox", { name: "kinh dị" })).toBeNull();
  });

  it("follows the main genre while the new-story form is open", async () => {
    const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
    const select = () => container.querySelector<HTMLSelectElement>('select[name="genre"]')!;
    await waitFor(() => expect(select().options).toHaveLength(2));

    // "kinh dị" is selected by default, so the picker starts on the other one.
    expect(screen.queryByRole("checkbox", { name: "kinh dị" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "trinh thám" })).toBeTruthy();

    fireEvent.change(select(), { target: { value: "trinh thám" } });
    expect(screen.getByRole("checkbox", { name: "kinh dị" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "trinh thám" })).toBeNull();
  });

  it("keeps a sub-genre on screen after it becomes the main genre", async () => {
    // Hiding it while it is still in `tags` leaves a tag that gets saved and
    // that nobody can take off again.
    const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
    const select = () => container.querySelector<HTMLSelectElement>('select[name="genre"]')!;
    await waitFor(() => expect(select().options).toHaveLength(2));

    fireEvent.click(screen.getByRole("checkbox", { name: "trinh thám" }));
    fireEvent.change(select(), { target: { value: "trinh thám" } });

    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "trinh thám" });
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(container.querySelector<HTMLInputElement>('input[name="tags"]')!.value).toBe("");
    expect(screen.queryByRole("checkbox", { name: "trinh thám" })).toBeNull();
  });

  it("says so when the catalogue holds nothing BUT the main genre", async () => {
    // Different from an empty catalogue: there is no job to go and do.
    const saved = FIXTURES["/api/genres"];
    FIXTURES["/api/genres"] = {
      genres: [{ id: "g1", name: "kinh dị", description: "…", enabled: true, usedBy: 3 }],
      unlisted: [],
    };
    try {
      const { container } = renderAt("/series/new", "/series/new", <SeriesNew />);
      await waitFor(() =>
        expect(container.textContent).toContain("every genre in it is the main one"),
      );
      expect(container.textContent).not.toContain("The genre catalogue is empty");
    } finally {
      FIXTURES["/api/genres"] = saved;
    }
  });

  it("an empty catalogue and no sub-genres yet just reports empty", async () => {
    const { container } = await withEmptyCatalog(async () => {
      const r = renderAt("/series/new", "/series/new", <SeriesNew />);
      await waitFor(() => expect(r.container.textContent).toContain("The genre catalogue is empty"));
      return r;
    });
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    // The hidden input stays so the form still submits, just empty.
    expect(container.querySelector<HTMLInputElement>('input[name="tags"]')!.value).toBe("");
  });
});

/** Run `body` with /api/genres returning an empty catalogue, then restore the fixture. */
async function withEmptyCatalog<T>(body: () => Promise<T>): Promise<T> {
  const saved = FIXTURES["/api/genres"];
  FIXTURES["/api/genres"] = { genres: [], unlisted: [] };
  try {
    return await body();
  } finally {
    FIXTURES["/api/genres"] = saved;
  }
}

describe("the model box says which model is actually about to run", () => {
  // The story had its own model saved and the episode page still offered
  // "— default: <the Models page default> —". The run did use the story's model,
  // because the fallback is applied when the job is queued — so the only thing
  // wrong was the sentence, which is the worst kind of wrong: you change the box
  // to fix something that was never broken, and now it IS.
  // The page carries several of these — one per thing you can start from it — and
  // they do NOT all follow the story's model, so read them as a set.
  const boxes = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLSelectElement>('select[name="model"]')].map((sel) => ({
      blank: sel.querySelector('option[value=""]')?.textContent ?? "",
      hint: sel.closest("label")?.textContent ?? "",
    }));

  it("names the story's model on a run started from the episode page", async () => {
    const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
    await waitFor(() => expect(container.querySelector('select[name="model"]')).toBeTruthy());
    expect(boxes(container).some((b) => b.blank.includes("this story: qwen3:32b"))).toBe(true);
  });

  it("does NOT claim it on the translate box, which follows its own default", async () => {
    // Naming the story's model there would be the same lie pointing the other way:
    // TRANSLATE is not one of the steps a story's model applies to.
    const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
    await waitFor(() => expect(container.querySelector('select[name="model"]')).toBeTruthy());
    const translate = boxes(container).find((b) =>
      b.hint.includes("Change the default on the Models page"),
    );
    expect(translate).toBeTruthy();
    expect(translate!.blank).not.toContain("this story");
  });

  it("falls back to naming the global default when the story has no model", async () => {
    const ep = FIXTURES["/api/episodes/e1"] as { series: { model: string } };
    const saved = ep.series.model;
    ep.series.model = "";
    try {
      const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
      await waitFor(() => expect(container.querySelector('select[name="model"]')).toBeTruthy());
      expect(boxes(container).some((b) => b.blank.includes("default: qwen3:14b"))).toBe(true);
      expect(boxes(container).every((b) => !b.blank.includes("this story"))).toBe(true);
    } finally {
      ep.series.model = saved;
    }
  });

  it("the story page's own box shows the saved model, not the default", async () => {
    const { container } = renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(container.querySelector('select[name="model"]')).toBeTruthy());
    const select = container.querySelector<HTMLSelectElement>('select[name="model"]')!;
    expect(select.value).toBe("qwen3:32b");
  });

  it("keeps a saved model that the provider no longer lists", async () => {
    // Ollama has not pulled it back, or it dropped off the recent list. Falling
    // silently to "default" would move the story onto another model on one Save.
    const s1 = FIXTURES["/api/series/s1"] as { model: string };
    const saved = s1.model;
    s1.model = "some-model-nobody-has";
    try {
      const { container } = renderAt("/series/s1", "/series/:id", <Series />);
      await waitFor(() => expect(container.querySelector('select[name="model"]')).toBeTruthy());
      const select = container.querySelector<HTMLSelectElement>('select[name="model"]')!;
      expect(select.value).toBe("some-model-nobody-has");
      expect(container.textContent).toContain("(not listed)");
    } finally {
      s1.model = saved;
    }
  });
});

describe("a review's findings are shown against the scene they are about", () => {
  /** Two chapters of two scenes, so an episode-wide scene number is not a chapter one. */
  function episodeWithReview(issues: unknown[], contractBreaks: unknown[] = []) {
    const scene = (id: string, order: number, text: string) => ({
      id,
      order,
      beat: `beat ${id}`,
      text,
      sourceText: null,
      storySoFar: "",
      revisions: [],
      characterIds: [],
      setup: null,
    });
    return {
      ...(FIXTURES["/api/episodes/e1"] as Record<string, unknown>),
      chapters: [
        {
          id: "ch1",
          order: 1,
          title: null,
          setup: null,
          scenes: [scene("sc1", 1, "một"), scene("sc2", 2, "hai")],
        },
        {
          id: "ch2",
          order: 2,
          title: null,
          setup: null,
          scenes: [scene("sc3", 1, "ba"), scene("sc4", 2, "bốn")],
        },
      ],
      reviews: [
        {
          id: "r1",
          verdict: "polish",
          summary: "Đọc được.",
          scores: { prose: 70 },
          issues,
          contractBreaks,
          scenes: [],
          correction: null,
          createdAt: "2026-09-21T11:00:00Z",
        },
      ],
    };
  }

  function renderEpisode(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const path = String(input).split("?")[0]!;
        const fixture = path === "/api/episodes/e1" ? body : FIXTURES[path];
        return Promise.resolve(
          new Response(JSON.stringify(fixture ?? { error: "missing" }), {
            status: fixture === undefined ? 404 : 200,
          }),
        );
      }),
    );
    return renderAt("/episode/e1", "/episode/:id", <Episode />);
  }

  /**
   * The card for one scene, so a finding can be shown to be INSIDE it.
   *
   * By the heading's own span rather than by text: the reading modal repeats the same
   * "Scene 2.2" further down the card, and getByText will not choose between them.
   */
  function card(container: HTMLElement, label: string): HTMLElement {
    const heading = [...container.querySelectorAll("span.tabular-nums")].find(
      (el) => el.textContent === label,
    );
    return heading!.closest("div.rounded") as HTMLElement;
  }

  const issue = (scene: number, what: string) => ({
    dimension: "consistency",
    severity: "error",
    scene,
    what,
    evidence: `quote for ${scene}`,
    suggestion: "",
    requiresChange: true,
  });

  it("episode-wide scene 4 lands on scene 2.2, not on 2.1 and not on chapter 1", async () => {
    // The whole reason this mapping exists. The review counts scenes straight through
    // the episode, the page numbers them within their chapter, and reading "Scene 4"
    // as chapter 4 — or as the fourth scene of chapter 1 — both put the finding under
    // prose it says nothing about.
    const { container } = renderEpisode(episodeWithReview([issue(4, "sai ở cảnh cuối")]));
    await waitFor(() => expect(screen.getByText(/sai ở cảnh cuối/)).toBeDefined());

    expect(card(container, "Scene 2.2").textContent).toContain("sai ở cảnh cuối");
    expect(card(container, "Scene 2.1").textContent).not.toContain("sai ở cảnh cuối");
    expect(card(container, "Scene 1.1").textContent).not.toContain("sai ở cảnh cuối");
  });

  it("counts the work in the scene's own heading", async () => {
    const { container } = renderEpisode(
      episodeWithReview([
        issue(1, "một lỗi"),
        { ...issue(1, "chỉ để biết"), requiresChange: false },
      ]),
    );
    await waitFor(() => expect(screen.getByText(/một lỗi/)).toBeDefined());
    // Two findings, one of them work.
    expect(card(container, "Scene 1.1").textContent).toContain("1 to fix");
  });

  it("findings that quote the same passage are shown together, under one copy of it", async () => {
    // One passage usually breaks several things at once. A copy of it under each
    // finding read as several separate faults to go and look for.
    const { container } = renderEpisode(
      episodeWithReview([issue(1, "lỗi một"), issue(1, "lỗi hai")]),
    );
    await waitFor(() => expect(screen.getByText(/lỗi hai/)).toBeDefined());
    const text = card(container, "Scene 1.1").textContent!;
    expect(text.split("quote for 1")).toHaveLength(2);
    // And the one copy sits under BOTH of them, not between them.
    expect(text.indexOf("lỗi một")).toBeLessThan(text.indexOf("lỗi hai"));
    expect(text.indexOf("lỗi hai")).toBeLessThan(text.indexOf("quote for 1"));
  });

  it("offers to fix the passage only when the quote is REALLY in the scene", async () => {
    // The point of making the review quote verbatim. A quote that is in the draft can
    // be handed to the step that rewrites one passage; a paraphrased one would send
    // that job looking for text nobody wrote.
    const body = episodeWithReview([
      { ...issue(1, "hỏng chỗ này"), evidence: "một" },
      { ...issue(2, "hỏng chỗ kia"), evidence: "không có trong văn" },
    ]);
    const { container } = renderEpisode(body);
    await waitFor(() => expect(screen.getByText(/hỏng chỗ kia/)).toBeDefined());

    // Scene 1.1's text IS "một".
    expect(card(container, "Scene 1.1").textContent).toContain("fix this passage");
    // Scene 1.2's text is "hai", and the quote is nowhere in it.
    expect(card(container, "Scene 1.2").textContent).not.toContain("fix this passage");
  });

  it("a broken contract goes into the instruction even when a suggestion exists", async () => {
    // The one finding that is not a matter of taste. A rewrite that fixes the pacing
    // while going past the same forbidden line has not fixed the passage.
    const { container } = renderEpisode(
      episodeWithReview(
        [{ ...issue(1, "nhịp gấp"), evidence: "một", suggestion: "Chậm lại" }],
        [{ scene: 1, broke: "không được lộ danh tính", evidence: "một" }],
      ),
    );
    await waitFor(() => expect(screen.getByText(/nhịp gấp/)).toBeDefined());

    const confirms: string[] = [];
    vi.stubGlobal("confirm", vi.fn((msg: string) => (confirms.push(msg), false)));
    const button = [...card(container, "Scene 1.1").querySelectorAll("button")].find(
      (b) => b.textContent === "fix this passage",
    )!;
    fireEvent.click(button);

    expect(confirms[0]).toContain("Chậm lại");
    expect(confirms[0]).toContain("không được lộ danh tính");
  });

  it("finds a quote the model wrapped in quote marks of its own", async () => {
    // The last measured failure: narration that ends on a line of dialogue comes back
    // with a pair of marks round the whole thing, its interior matching the draft
    // character for character. Refusing it would lose a finding over punctuation.
    const { container } = renderEpisode(
      episodeWithReview([{ ...issue(1, "thừa ngoặc"), evidence: "\u201cmột\u201d" }]),
    );
    await waitFor(() => expect(screen.getByText(/thừa ngoặc/)).toBeDefined());
    expect(card(container, "Scene 1.1").textContent).toContain("fix this passage");
  });

  it("does NOT strip a quote that already matched, nor rescue one that is simply wrong", async () => {
    const { container } = renderEpisode(
      episodeWithReview([
        { ...issue(1, "đúng sẵn"), evidence: "một" },
        { ...issue(2, "bịa ra"), evidence: "\u201ckhông hề có\u201d" },
      ]),
    );
    await waitFor(() => expect(screen.getByText(/bịa ra/)).toBeDefined());
    expect(card(container, "Scene 1.1").textContent).toContain("fix this passage");
    expect(card(container, "Scene 1.2").textContent).not.toContain("fix this passage");
  });

  it("a finding follows its own quote when the review names the wrong scene", async () => {
    // Measured, not imagined: one read named scene 1 for five of seven findings while
    // every passage they quoted was in scene 2. Between a claim that can be checked
    // against the draft and a number that cannot, the checkable one wins.
    const { container } = renderEpisode(
      episodeWithReview([{ ...issue(1, "thật ra ở cảnh sau"), evidence: "hai" }]),
    );
    await waitFor(() => expect(screen.getByText(/thật ra ở cảnh sau/)).toBeDefined());

    expect(card(container, "Scene 1.2").textContent).toContain("thật ra ở cảnh sau");
    expect(card(container, "Scene 1.1").textContent).not.toContain("thật ra ở cảnh sau");
    // And it says so, rather than moving it quietly.
    expect(card(container, "Scene 1.2").textContent).toContain("the review said scene 1");
  });

  it("leaves a finding where the review put it when the quote is in two scenes", async () => {
    // Picking one of them would be a guess dressed up as a correction.
    const body = episodeWithReview([{ ...issue(1, "mơ hồ"), evidence: "chung" }]);
    for (const ch of (body as { chapters: { scenes: { text: string }[] }[] }).chapters) {
      for (const sc of ch.scenes) sc.text = "chung";
    }
    const { container } = renderEpisode(body);
    await waitFor(() => expect(screen.getByText(/mơ hồ/)).toBeDefined());
    expect(card(container, "Scene 1.1").textContent).toContain("mơ hồ");
    expect(card(container, "Scene 1.1").textContent).not.toContain("the review said");
  });

  it("shows what to DO about it, not only what is wrong", async () => {
    const { container } = renderEpisode(
      episodeWithReview([
        { ...issue(1, "lời thú nhận gọn quá"), suggestion: "Để nàng dừng lại trước khi nói" },
      ]),
    );
    await waitFor(() => expect(screen.getByText(/lời thú nhận gọn quá/)).toBeDefined());
    expect(card(container, "Scene 1.1").textContent).toContain(
      "Để nàng dừng lại trước khi nói",
    );
  });

  it("a scene number the episode does not have is SAID, not dropped", async () => {
    // The finding is still a reader saying something. Filing it nowhere looks exactly
    // like a review that never made it.
    renderEpisode(episodeWithReview([issue(9, "cảnh không tồn tại")]));
    await waitFor(() => expect(screen.getByText(/cảnh không tồn tại/)).toBeDefined());
    expect(screen.getByText(/scene number this episode does not have/)).toBeDefined();
  });

  it("an episode-level finding stays in the panel", async () => {
    const { container } = renderEpisode(episodeWithReview([issue(0, "cả tập đều nhạt")]));
    await waitFor(() => expect(screen.getByText(/cả tập đều nhạt/)).toBeDefined());
    for (const label of ["Scene 1.1", "Scene 1.2", "Scene 2.1", "Scene 2.2"]) {
      expect(card(container, label).textContent).not.toContain("cả tập đều nhạt");
    }
  });

  it("a contract break outranks the issues on the same scene", async () => {
    const { container } = renderEpisode(
      episodeWithReview([issue(1, "lỗi thường")], [
        { scene: 1, broke: "không được lộ danh tính", evidence: "quote for break" },
      ]),
    );
    await waitFor(() => expect(screen.getByText(/không được lộ danh tính/)).toBeDefined());
    const text = card(container, "Scene 1.1").textContent!;
    expect(text.indexOf("không được lộ danh tính")).toBeLessThan(text.indexOf("lỗi thường"));
  });
});

describe("the story page says which episode is waiting on a person", () => {
  type Eps = { episodes: Array<Record<string, unknown>> };

  function withEpisode(patch: Record<string, unknown>) {
    const s1 = FIXTURES["/api/series/s1"] as Eps;
    const saved = s1.episodes[0]!;
    s1.episodes = [{ ...saved, ...patch }];
    return () => {
      s1.episodes = [saved];
    };
  }

  it("an approved episode is marked neither way", async () => {
    const { container } = renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() => expect(screen.getByText("Tập 1")).toBeDefined());
    expect(container.textContent).not.toContain("waiting on your read");
    expect(container.textContent).not.toContain("no chapters yet");
  });

  it("a drafted episode nobody has read says so", async () => {
    // The one place the pipeline stops ON A PERSON. The row listed what an episode had
    // and never what it was waiting for, so finding that episode meant opening each one.
    const restore = withEpisode({ status: "DRAFTED", humanReviewed: false });
    try {
      const { container } = renderAt("/series/s1", "/series/:id", <Series />);
      await waitFor(() => expect(screen.getByText("Tập 1")).toBeDefined());
      expect(container.textContent).toContain("waiting on your read");
    } finally {
      restore();
    }
  });

  it("an episode with no chapter yet says that instead", async () => {
    // It cannot be waiting on a read: there is nothing written to read.
    const restore = withEpisode({
      status: "DRAFTED",
      humanReviewed: false,
      _count: { chapters: 0, blocks: 0 },
    });
    try {
      const { container } = renderAt("/series/s1", "/series/:id", <Series />);
      await waitFor(() => expect(screen.getByText("Tập 1")).toBeDefined());
      expect(container.textContent).toContain("no chapters yet");
      expect(container.textContent).not.toContain("waiting on your read");
    } finally {
      restore();
    }
  });
});

describe("saying how long a chapter is", () => {
  type Ch = { chapters: Array<Record<string, unknown>> };

  function withChapter(patch: Record<string, unknown>) {
    const ep = FIXTURES["/api/episodes/e1"] as Ch;
    const saved = ep.chapters[0]!;
    ep.chapters = [{ ...saved, ...patch }];
    return () => {
      ep.chapters = [saved];
    };
  }

  it("is a field you can type into, not a fixed value", async () => {
    // The whole reason Chapter.endsAtScene exists is to say the length BEFORE the
    // scenes are written, so the ones before the last are told not to resolve. The
    // control was a hidden input pinned to the scene count, which could only ever say
    // "stop now" — the one case that needs no planning.
    const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
    await waitFor(() => expect(screen.getByText(/Approve the draft/)).toBeDefined());

    const input = container.querySelector<HTMLInputElement>('input[name="endsAtScene"]')!;
    expect(input.type).toBe("number");
    // One scene exists, so that is the default and also the floor: ending a chapter
    // behind its own scenes would strand the ones past the end.
    expect(input.defaultValue).toBe("1");
    expect(input.min).toBe("1");
  });

  it("counts down the scenes still owed when the end is ahead of them", async () => {
    const restore = withChapter({ endsAtScene: 4 });
    try {
      const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
      await waitFor(() => expect(screen.getByText(/Approve the draft/)).toBeDefined());
      expect(container.textContent).toContain("3 still to come");
      expect(container.textContent).toContain("NOT to resolve the chapter");
    } finally {
      restore();
    }
  });

  it("says the last scene is told to land it once the end is reached", async () => {
    const restore = withChapter({ endsAtScene: 1 });
    try {
      const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
      await waitFor(() => expect(screen.getByText(/Approve the draft/)).toBeDefined());
      expect(container.textContent).toContain("told to land it");
      expect(container.textContent).not.toContain("still to come");
    } finally {
      restore();
    }
  });

  it("a chapter served without the field is OPEN, not declared", async () => {
    // `!== null` read undefined as "the writer has said", and offered to undo a
    // declaration nobody had made.
    const restore = withChapter({ endsAtScene: undefined });
    try {
      const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
      await waitFor(() => expect(screen.getByText(/Approve the draft/)).toBeDefined());
      expect(container.querySelector('input[name="endsAtScene"]')).toBeTruthy();
      expect(container.textContent).not.toContain("reopen it");
    } finally {
      restore();
    }
  });
});

describe("a one-click action says what it did, and what went wrong later", () => {
  it("shows the route's own answer instead of going quiet", async () => {
    // Every ActionButton in Studio was silent: the button dimmed and came back looking
    // the same whether the work had been queued or not. Pressing "fix this passage" and
    // seeing nothing is why it got pressed twice, and the second job died like the first.
    const episode = {
      ...(FIXTURES["/api/episodes/e1"] as Record<string, unknown>),
      reviews: [
        {
          id: "r1",
          verdict: "polish",
          summary: "Đọc được.",
          scores: { prose: 70 },
          issues: [
            {
              dimension: "prose",
              severity: "warning",
              scene: 1,
              what: "câu này cụt",
              evidence: "Trời tối.",
              suggestion: "Cho nó thở ra một nhịp",
              requiresChange: true,
            },
          ],
          contractBreaks: [],
          scenes: [],
          correction: null,
          createdAt: "2026-09-24T07:00:00Z",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const path = String(input).split("?")[0]!;
        if (path === "/api/episodes/e1") {
          return Promise.resolve(new Response(JSON.stringify(episode), { status: 200 }));
        }
        if (path.endsWith("/revise")) {
          // What the route really answers — see episodes.ts.
          return Promise.resolve(
            new Response(JSON.stringify({ ok: "Rewriting that passage…" }), { status: 200 }),
          );
        }
        const body = FIXTURES[path];
        return Promise.resolve(
          new Response(JSON.stringify(body ?? { error: "missing" }), {
            status: body === undefined ? 404 : 200,
          }),
        );
      }),
    );

    const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
    await waitFor(() => expect(screen.getByText("fix this passage")).toBeDefined());

    fireEvent.click(screen.getByText("fix this passage"));
    await waitFor(() => expect(screen.getByRole("status")).toBeDefined());
    expect(container.textContent).toContain("Rewriting that passage…");
  });

  it("a job that failed in the worker is reported on the page", async () => {
    // It fails minutes after the request that queued it returned 200, so the button is
    // long done and the page is the only thing still watching.
    const ep = FIXTURES["/api/episodes/e1"] as { renderJobs: unknown[] };
    ep.renderJobs = [
      {
        id: "j9",
        type: "REVISE_PASSAGE",
        status: "FAILED",
        progress: 10,
        error: "OpenRouter is rate-limiting (429). Wait and try again.",
        payload: { sceneId: "sc1" },
      },
    ];
    try {
      const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
      await waitFor(() => expect(screen.getByText(/Approve the draft/)).toBeDefined());
      expect(container.textContent).toContain("REVISE_PASSAGE failed");
      expect(container.textContent).toContain("rate-limiting (429)");
      expect(container.textContent).toContain("Nothing was changed");
    } finally {
      ep.renderJobs = [];
    }
  });

  it("a running job hides the failure, and the scene's fix button with it", async () => {
    const ep = FIXTURES["/api/episodes/e1"] as { renderJobs: unknown[] };
    ep.renderJobs = [
      { id: "j8", type: "WRITE_SCENE", status: "RUNNING", progress: 40, error: null, payload: null },
    ];
    try {
      const { container } = renderAt("/episode/e1", "/episode/:id", <Episode />);
      await waitFor(() => expect(screen.getByText(/Approve the draft/)).toBeDefined());
      expect(container.textContent).toContain("WRITE_SCENE running");
      expect(container.textContent).not.toContain("failed");
      expect(container.textContent).not.toContain("fix this passage");
    } finally {
      ep.renderJobs = [];
    }
  });
});
