import { render, screen, waitFor } from "@testing-library/react";
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
import { Job } from "./Job";
import { Prompt } from "./Prompt";
import { Prompts } from "./Prompts";
import { Series } from "./Series";
import { SeriesList } from "./SeriesList";
import { SeriesNew } from "./SeriesNew";
import { Tracks } from "./Tracks";

/**
 * Kiểm mỗi trang render được với dữ liệu THẬT-DẠNG từ API.
 *
 * Đây là lưới an toàn cho lần chuyển từ Next sang Vite: TypeScript bắt được sai
 * kiểu, nhưng không bắt được `data.x.y` khi `x` là mảng rỗng hay null. Kiểu lỗi
 * đó chỉ hiện lúc mở trang, mà mở tay 13 trang thì lần nào cũng sót.
 */

/** Dữ liệu mẫu cho từng endpoint — hình dạng khớp route ở apps/api. */
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
  "/api/series/s1": {
    id: "s1",
    title: "Đường về",
    description: "mô tả",
    genre: "kinh dị",
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
    series: { id: "s1", title: "Đường về" },
    scenes: [{ id: "sc1", order: 1, beat: "mở đầu", text: "Trời tối." }],
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
  "/api/prompts": {
    prompts: [
      {
        id: "p1",
        step: "WRITE_SCENE",
        genre: "*",
        version: 1,
        active: true,
        note: "mặc định",
        content: "{{context}}",
        wins: true,
      },
    ],
    steps: ["OUTLINE", "WRITE_SCENE", "AUDIO_EDIT", "SUMMARIZE", "ARC_SUMMARY", "METADATA"],
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
      updatedAt: "2026-08-18T07:00:00Z",
    },
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
        return Promise.resolve(new Response(JSON.stringify({ error: "thiếu fixture: " + path }), { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
  // jsdom chưa có; trang audio dùng window.confirm trong nút xoá.
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => vi.unstubAllGlobals());

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
  ["Bảng điều khiển", "/", "/", <Dashboard />, "Bảng điều khiển"],
  ["Danh sách truyện", "/series", "/series", <SeriesList />, "Đường về"],
  ["Truyện mới", "/series/new", "/series/new", <SeriesNew />, "Ý tưởng"],
  ["Bộ truyện", "/series/s1", "/series/:id", <Series />, "Chạy hàng loạt"],
  ["Story Bible", "/series/s1/bible", "/series/:id/bible", <Bible />, "Luật thế giới"],
  ["Nhân vật", "/series/s1/characters", "/series/:id/characters", <Characters />, "Giọng mặc định"],
  ["Sự kiện", "/series/s1/facts", "/series/:id/facts", <Facts />, "Tình tiết còn bỏ ngỏ"],
  ["Tập", "/episode/e1", "/episode/:id", <Episode />, "Duyệt bản thảo"],
  ["Audio của tập", "/episode/e1/audio", "/episode/:id/audio", <EpisodeAudio />, "Âm lượng nền"],
  ["Job", "/job/j1", "/job/:id", <Job />, "OUTLINE"],
  ["Thư viện nhạc", "/tracks", "/tracks", <Tracks />, "Thư viện nhạc"],
  ["Prompt (danh sách)", "/prompts", "/prompts", <Prompts />, "Viết cảnh"],
  ["Prompt (sửa)", "/prompts/p1", "/prompts/:id", <Prompt />, "Biến dùng được"],
];

describe("mọi trang render được", () => {
  it.each(PAGES)("%s", async (_name, path, route, element, expected) => {
    renderAt(path, route, element);
    await waitFor(() => expect(screen.getByText(new RegExp(expected))).toBeDefined());
  });
});

describe("trang hiện đúng cảnh báo quan trọng", () => {
  it("thư viện nhạc cảnh báo track chưa rõ giấy phép", async () => {
    renderAt("/tracks", "/tracks", <Tracks />);
    await waitFor(() =>
      expect(screen.getByText(/chưa xác minh giấy phép/)).toBeDefined(),
    );
  });

  it("tập chưa duyệt hiện chốt chặn, KHÔNG hiện nút tạo kịch bản", async () => {
    renderAt("/episode/e1", "/episode/:id", <Episode />);
    await waitFor(() => expect(screen.getByText(/Tôi đã đọc và duyệt/)).toBeDefined());
    expect(screen.queryByText(/tạo kịch bản/)).toBeNull();
  });

  it("prompt mặc định hiện là đang dùng và không cho xoá", async () => {
    renderAt("/prompts/p1", "/prompts/:id", <Prompt />);
    await waitFor(() => expect(screen.getByText(/mặc định — mọi thể loại/)).toBeDefined());
    expect(screen.getAllByText("đang dùng").length).toBeGreaterThan(0);
    expect(screen.queryByText(/xoá biến thể/)).toBeNull();
    expect(screen.getByText(/Bản mặc định không xoá được/)).toBeDefined();
  });
});
