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
  "/api/series": [
    {
      id: "s1",
      title: "Đường về",
      description: "mô tả",
      genre: "kinh dị",
      kind: "LONG",
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
    kind: "LONG",
    arcSummary: null,
    arcThroughEpisode: null,
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
        wordCount: 2500,
        durationMs: 1200000,
        _count: { scenes: 4, blocks: 12 },
        exports: [{ id: "x1" }],
      },
    ],
    batchRuns: [],
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
        state: null,
        stateThroughEpisode: null,
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
      characters: [{ id: "c1", name: "Tài", isNarrator: true }],
    },
    chapters: [
      {
        id: "ch1",
        order: 1,
        title: "Đêm đầu tiên",
        setup: null,
        scenes: [
          {
            id: "sc1",
            order: 1,
            beat: "mở đầu",
            text: "Trời tối.",
            sourceText: null,
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
  "/api/models": {
    reachable: true,
    reason: null,
    version: "0.5.0",
    url: "http://localhost:11434",
    provider: "ollama",
    embedProvider: "mock",
    installed: [
      {
        name: "qwen3:8b",
        sizeBytes: 5_200_000_000,
        parameterSize: "8.2B",
        quantization: "Q4_K_M",
        modifiedAt: "2026-08-01T00:00:00Z",
      },
    ],
    recent: ["qwen3:8b"],
    language: { value: "vi", fromEnv: true },
    configured: [
      { label: "Writing", kind: "write", value: "qwen3:14b", source: "installed", model: "qwen3:14b", installed: false },
      { label: "Utility — summaries, metadata", kind: "utility", value: "qwen3:8b", source: "setting", model: "qwen3:8b", installed: true },
    ],
    promptOverrides: [{ label: "Prompt WRITE_SCENE", model: "qwen3:32b", installed: false }],
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
    steps: ["OUTLINE", "WRITE_SCENE", "AUDIO_EDIT", "SUMMARIZE", "ARC_SUMMARY", "METADATA"],
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
        const body =
          path === "/api/models"
            ? { ...base, reachable: false, version: null, installed: [], recent: [] }
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
    expect(container.textContent).toMatch(/changing things here does not touch it/i);
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
    await waitFor(() => expect(options()).toEqual(["kinh dị"]));
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
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "kinh dị" })).toBeTruthy());
    const tags = () => container.querySelector<HTMLInputElement>('input[name="tags"]')!.value;

    fireEvent.click(screen.getByRole("checkbox", { name: "kinh dị" }));
    expect(tags()).toBe("tình cảm, slow burn, kinh dị");

    fireEvent.click(screen.getByRole("checkbox", { name: "tình cảm" }));
    expect(tags()).toBe("slow burn, kinh dị");
  });

  it("a genre the story carries but the catalogue lacks still shows, still ticked", async () => {
    // Drop them and one Save wipes them, with nothing said.
    renderAt("/series/s1", "/series/:id", <Series />);
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "slow burn" })).toBeInstanceOf(HTMLInputElement),
    );
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "slow burn" }).checked).toBe(true);
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
