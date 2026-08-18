# Cấu trúc thư mục mã nguồn

> Monorepo pnpm workspaces + Turborepo. Ba ứng dụng, sáu package dùng chung.
> Xem thêm: [`PLAN.md`](../PLAN.md) · [`database.md`](database.md) · [`setup-wsl2.md`](setup-wsl2.md)

---

## 1. Vì sao monorepo, không phải một app Next.js

Plan mục 4 ghi "một codebase cho cả Studio và Player". Đúng về ý — nhưng **hai trang này deploy ở hai nơi khác nhau**, nên phải tách thành hai app trong cùng repo:

| | Studio | Player |
|---|---|---|
| Chạy ở | PC tại nhà (WSL2) | Vercel |
| Cần | Ollama, TTS, ffmpeg, GPU | Chỉ đọc dữ liệu + phát audio |
| Truy cập | Chỉ mình bạn | Công khai |

Nếu gộp một app, code gọi Ollama và ffmpeg sẽ bị đóng gói và đẩy lên Vercel — vừa thừa, vừa lộ cấu hình nội bộ. Tách app nhưng **dùng chung package** cho phần lõi (schema, kiểu dữ liệu, logic domain) giữ được lợi ích "một codebase" mà không mang theo rác.

---

## 2. ⚠️ Một khoảng trống trong plan cần quyết trước khi code

Plan để **Postgres chạy Docker local**, nhưng Player deploy trên Vercel — **Vercel không kết nối được vào Postgres nằm trong WSL2 ở nhà bạn** (IP động, tắt máy là mất, không mở cổng ra internet). Đây là chỗ plan chưa nói tới.

Ba cách xử lý, mình đề xuất cách 2:

| Cách | Mô tả | Đánh giá |
|---|---|---|
| 1. Một DB hosted duy nhất | Cả Studio lẫn Player dùng Neon/Supabase | Đơn giản nhất, nhưng **bản thảo và ý tưởng rời khỏi máy** — trái mục tiêu "riêng tư" ở mục 1 của plan |
| **2. Hai DB, đồng bộ một chiều** ✅ | Studio dùng Postgres local (đầy đủ). Khi xuất bản, đẩy **chỉ phần công khai** sang Postgres hosted mà Player đọc | Giữ được bản thảo ở máy, chỉ nội dung đã đăng mới ra ngoài. Đúng tinh thần plan. |
| 3. Player tĩnh hoàn toàn | Sinh SSG mỗi lần xuất bản | Mất bình luận, đánh giá, đồng bộ vị trí nghe |

**Cách 2 hoạt động thế nào:** cùng một Prisma schema, hai `DATABASE_URL`. Job `PUBLISH` copy các bảng công khai (`Series`, `Episode` đã publish, `Export`, `Character`) sang DB hosted. Bảng riêng tư (`Scene`, `draftText`, `LlmRun`, `Prompt`, `RenderJob`) không bao giờ rời máy. Bảng phía người nghe (`Comment`, `Rating`, `ListenProgress`) chỉ tồn tại ở DB hosted.

Chi tiết ánh xạ bảng nằm ở `packages/database/src/publish-scope.ts` trong cấu trúc dưới đây.

---

## 3. Cây thư mục

```
audio-truyen/
├── apps/
│   ├── studio/                    # Next.js — chạy local, cổng 3000
│   ├── player/                    # Next.js — deploy Vercel
│   └── worker/                    # Node — tiêu thụ hàng đợi BullMQ
│
├── packages/
│   ├── database/                  # Prisma schema + client
│   ├── core/                      # Logic domain, không phụ thuộc framework
│   ├── llm/                       # Ollama client + render prompt
│   ├── tts/                       # TTSProvider + các adapter
│   ├── audio/                     # ffmpeg, loudnorm, waveform, video
│   └── config/                    # env, hằng số, ngân sách VRAM
│
├── docs/
│   ├── PLAN.md → ../PLAN.md
│   ├── database.md
│   ├── setup-wsl2.md
│   └── project-structure.md       # file này
│
├── prompts/                       # prompt gốc dạng .md, seed vào DB
├── scripts/                       # tiện ích chạy tay
├── docker-compose.yml             # Postgres + Redis local
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. `apps/studio` — giao diện sản xuất

```
apps/studio/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                        # bảng điều khiển: hàng đợi + việc đang chạy
│   │   │
│   │   ├── series/
│   │   │   ├── page.tsx                    # danh sách bộ truyện
│   │   │   ├── new/page.tsx                # tạo từ 1 dòng ý tưởng (bước 0a)
│   │   │   └── [id]/
│   │   │       ├── page.tsx                # tổng quan bộ
│   │   │       ├── bible/page.tsx          # Story Bible: luật thế giới, giọng văn
│   │   │       ├── characters/page.tsx     # nhân vật + casting giọng (bước 2)
│   │   │       └── pronunciation/page.tsx  # từ điển phát âm
│   │   │
│   │   ├── episode/[id]/
│   │   │   ├── page.tsx                    # wizard 6 bước, tab theo bước
│   │   │   ├── outline/page.tsx            # bước 0a — sửa dàn ý
│   │   │   ├── write/page.tsx              # bước 0b — viết cảnh, stream chữ
│   │   │   ├── review/page.tsx             # bước 1 — duyệt bản thảo
│   │   │   ├── script/page.tsx             # bước 2 — block + gán giọng
│   │   │   ├── audio/page.tsx              # bước 3 — nghe & duyệt từng block
│   │   │   ├── mix/page.tsx                # bước 4 — nhạc nền, ducking
│   │   │   └── publish/page.tsx            # bước 5 — xuất bản
│   │   │
│   │   ├── library/
│   │   │   ├── voices/page.tsx             # thư viện giọng, nghe thử
│   │   │   └── tracks/page.tsx             # nhạc nền/SFX + giấy phép
│   │   │
│   │   ├── prompts/page.tsx                # sửa prompt, xem version
│   │   ├── stats/page.tsx                  # LlmRun: tok/s, model nào viết hay
│   │   │
│   │   └── api/
│   │       ├── jobs/
│   │       │   ├── route.ts                # POST tạo job, GET danh sách
│   │       │   └── [id]/
│   │       │       ├── route.ts            # GET trạng thái, DELETE huỷ
│   │       │       └── stream/route.ts     # SSE tiến độ + chữ chạy dần
│   │       ├── episodes/[id]/route.ts
│   │       ├── blocks/[id]/route.ts
│   │       └── system/health/route.ts      # GPU, VRAM, độ dài hàng đợi
│   │
│   ├── components/
│   │   ├── queue/                          # QueueBoard, JobCard, VramMeter
│   │   ├── editor/                         # SceneEditor, StreamingText, DiffView
│   │   ├── script/                         # BlockList, SpeakerPicker, VoicePicker
│   │   ├── audio/                          # BlockPlayer, WaveformPreview
│   │   └── ui/                             # shadcn/ui
│   │
│   ├── hooks/
│   │   ├── use-job-stream.ts               # nối SSE, cập nhật tiến độ
│   │   └── use-vram-budget.ts
│   └── lib/
│       ├── queue-client.ts                 # đẩy job vào BullMQ
│       └── format.ts
├── next.config.ts
└── package.json
```

**Nguyên tắc:** Studio **không tự chạy LLM hay ffmpeg**. Nó chỉ tạo job và đọc kết quả. Toàn bộ việc nặng nằm ở `apps/worker`. Nhờ vậy đóng/mở tab trình duyệt không làm gián đoạn job đang chạy.

---

## 5. `apps/player` — trang cho người nghe

```
apps/player/
├── src/
│   ├── app/
│   │   ├── layout.tsx                      # bọc MiniPlayer toàn cục
│   │   ├── page.tsx                        # trang chủ: mới nhất, đang hot, theo thể loại
│   │   ├── truyen/[slug]/page.tsx          # trang bộ truyện + danh sách tập
│   │   ├── nghe/[id]/page.tsx              # trang nghe + văn bản chạy theo audio
│   │   ├── the-loai/[genre]/page.tsx
│   │   ├── api/
│   │   │   ├── progress/route.ts           # lưu vị trí nghe
│   │   │   ├── comments/route.ts
│   │   │   └── ratings/route.ts
│   │   ├── sitemap.ts                      # SEO
│   │   └── feed/[slug]/route.ts            # RSS podcast (Phase 7)
│   │
│   ├── components/
│   │   ├── player/
│   │   │   ├── MiniPlayer.tsx              # thanh dưới đáy, cố định
│   │   │   ├── SleepTimer.tsx              # hẹn giờ tắt
│   │   │   ├── SpeedControl.tsx            # 0.75× → 2×
│   │   │   └── KaraokeText.tsx             # chữ chạy theo audio
│   │   ├── EpisodeList.tsx
│   │   └── ui/
│   │
│   ├── lib/
│   │   ├── media-session.ts                # điều khiển từ màn hình khoá
│   │   └── progress-store.ts               # localStorage + đồng bộ tài khoản
│   └── sw.ts                               # Service Worker — tải về nghe offline
├── public/manifest.json                    # PWA
└── package.json
```

---

## 6. `apps/worker` — nơi mọi việc nặng diễn ra

```
apps/worker/
├── src/
│   ├── index.ts                            # khởi động tất cả các làn
│   │
│   ├── lanes/                              # mỗi làn = một BullMQ Worker riêng
│   │   ├── llm.lane.ts                     # GPU, concurrency 1
│   │   ├── tts-cpu.lane.ts                 # CPU, concurrency = nproc/2
│   │   ├── tts-gpu.lane.ts                 # GPU, concurrency 1, kiểm tra VRAM
│   │   └── ffmpeg.lane.ts                  # concurrency 2
│   │
│   ├── jobs/                               # một file một loại job
│   │   ├── outline.job.ts                  # bước 0a
│   │   ├── write-scene.job.ts              # bước 0b
│   │   ├── audio-edit.job.ts               # bước 0c — tách block, gán người nói
│   │   ├── summarize.job.ts                # bước 0d
│   │   ├── metadata.job.ts
│   │   ├── tts.job.ts                      # bước 3 — tra cache trước khi render
│   │   ├── mix.job.ts                      # bước 4
│   │   ├── subtitle.job.ts                 # faster-whisper
│   │   ├── video.job.ts                    # bước 5 — MP4 9:16 NVENC
│   │   └── publish.job.ts                  # đẩy R2 + đồng bộ DB Player
│   │
│   ├── services/
│   │   ├── vram-guard.ts                   # đọc nvidia-smi, quyết định nhận job
│   │   ├── story-context.ts                # ghép Story Bible + tóm tắt + cảnh trước
│   │   ├── audio-cache.ts                  # tra/ghi AudioAsset theo cacheKey
│   │   └── storage.ts                      # upload R2
│   │
│   └── lib/
│       ├── progress.ts                     # cập nhật RenderJob.progress
│       └── logger.ts
└── package.json
```

### Sườn một làn job

```ts
// apps/worker/src/lanes/llm.lane.ts
import { Worker } from "bullmq";
import { JobLane } from "@audio/database";
import { vramGuard } from "../services/vram-guard";

export const llmLane = new Worker(
  JobLane.LLM,
  async (job) => {
    // Kiểm tra VRAM TRƯỚC khi nạp model — tràn VRAM không báo lỗi rõ,
    // driver âm thầm đẩy sang RAM và chậm đi ~10 lần
    await vramGuard.reserve(job.data.vramMb);
    try {
      return await handlers[job.name](job);
    } finally {
      vramGuard.release(job.data.vramMb);
    }
  },
  { connection, concurrency: 1 },   // GPU: luôn 1
);
```

---

## 7. Các package dùng chung

### `packages/database`

```
packages/database/
├── prisma/
│   ├── schema.prisma               # nội dung ở docs/database.md
│   ├── migrations/
│   └── seed.ts                     # Voice, Prompt, PronunciationEntry, AudioTrack
├── src/
│   ├── index.ts                    # export PrismaClient + toàn bộ kiểu
│   ├── client-studio.ts            # nối DATABASE_URL (local)
│   ├── client-player.ts            # nối PLAYER_DATABASE_URL (hosted)
│   └── publish-scope.ts            # bảng/cột nào được phép đẩy ra ngoài
└── package.json
```

`publish-scope.ts` là chốt chặn quyền riêng tư — khai báo tường minh thứ được ra khỏi máy:

```ts
export const PUBLIC_TABLES = ["Series", "Episode", "Character", "Export"] as const;

/// Cột KHÔNG BAO GIỜ rời máy, kể cả khi tập đã xuất bản
export const PRIVATE_COLUMNS: Record<string, string[]> = {
  Episode: ["draftText", "outline", "reviewedBy"],
  Series:  ["storyBible"],
};

/// Bảng chỉ tồn tại phía Studio
export const LOCAL_ONLY_TABLES = ["Scene", "LlmRun", "Prompt", "RenderJob", "AudioAsset"];
```

### `packages/tts` — interface hai tầng

```
packages/tts/
├── src/
│   ├── provider.ts                 # interface TTSProvider
│   ├── router.ts                   # narrator → tầng 1, nhân vật → tầng 2
│   ├── cache-key.ts                # sha256(text + engine + voice + params)
│   ├── pronunciation.ts            # áp từ điển trước khi đưa vào engine
│   └── providers/
│       ├── kokoro.ts               # ONNX Runtime, CPU, 0 VRAM
│       ├── piper.ts                # CPU, dự phòng, giấy phép MIT
│       ├── vixtts.ts               # GPU, clone giọng — kiểm tra giấy phép!
│       └── f5tts.ts                # GPU, clone giọng
└── package.json
```

```ts
// packages/tts/src/provider.ts
export interface TTSProvider {
  readonly name: string;
  readonly tier: "FAST" | "EXPRESSIVE";
  readonly vramMb: number;            // Kokoro/Piper = 0
  readonly commercialOk: boolean;     // chặn dùng nhầm khi xuất bản thương mại

  listVoices(): Promise<Voice[]>;
  synthesize(input: {
    text: string;
    voiceId: string;
    refAudio?: Buffer;                // engine clone giọng
    speed?: number;
    pitch?: number;
  }): Promise<{ audio: Buffer; durationMs: number }>;
}
```

### `packages/llm`

```
packages/llm/
├── src/
│   ├── ollama.ts                   # client, stream, đo tok/s
│   ├── prompt.ts                   # nạp Prompt từ DB, thay biến
│   ├── schema.ts                   # JSON schema ép định dạng đầu ra (0a, 0c)
│   └── telemetry.ts                # ghi LlmRun
└── package.json
```

### `packages/audio`

```
packages/audio/
├── src/
│   ├── concat.ts                   # nối block + chèn khoảng lặng
│   ├── mix.ts                      # nhạc nền + sidechaincompress (ducking)
│   ├── loudnorm.ts                 # -16 LUFS web / -19 LUFS phát thanh
│   ├── waveform.ts                 # showwaves cho video
│   ├── video.ts                    # MP4 9:16, h264_nvenc, cắt "Phần 1/3"
│   └── ffmpeg.ts                   # bọc spawn, phát tiến độ
└── package.json
```

### `packages/core` và `packages/config`

```
packages/core/                      # logic domain thuần, không import framework
├── src/
│   ├── episode-state.ts            # máy trạng thái + ràng buộc chuyển trạng thái
│   ├── scene-planner.ts            # chia tập thành cảnh 600–900 từ
│   ├── duration.ts                 # ước lượng thời lượng từ số từ
│   └── license-guard.ts            # chặn xuất bản khi có asset licenseType = UNKNOWN
└── package.json

packages/config/
├── src/
│   ├── env.ts                      # kiểm tra biến môi trường bằng zod
│   ├── vram.ts                     # ngân sách VRAM theo từng model/engine
│   └── constants.ts                # WORDS_PER_MINUTE, LUFS, kích thước cảnh
└── package.json
```

`episode-state.ts` và `license-guard.ts` là nơi cưỡng chế hai ràng buộc mà Prisma không làm được (xem mục 4 của `database.md`):

```ts
// packages/core/src/episode-state.ts
export function canTransition(from: EpisodeStatus, to: EpisodeStatus, ep: Episode) {
  if (from === "DRAFTED" && to === "SCRIPTED" && !ep.humanReviewed) {
    throw new Error("Bản thảo chưa được duyệt — không thể chuyển sang bước tạo audio.");
  }
  // ...
}
```

---

## 8. Chiều phụ thuộc — quy tắc import

```
apps/studio ─┐
apps/player ─┼─→ packages/core ─→ packages/database
apps/worker ─┘         │
                       ├─→ packages/llm
                       ├─→ packages/tts
                       ├─→ packages/audio
                       └─→ packages/config
```

**Ba luật:**

1. **Package không được import app.** Chiều phụ thuộc chỉ đi một hướng.
2. **`core` không import `llm`/`tts`/`audio`.** `core` chứa quy tắc nghiệp vụ thuần — phải test được mà không cần GPU, không cần ffmpeg.
3. **`apps/player` không được import `llm`, `tts`, `audio`.** Đặt luật này trong ESLint (`no-restricted-imports`) để không vô tình đóng gói client Ollama lên Vercel.

---

## 9. Biến môi trường

```
.env.local           # Studio + worker, KHÔNG commit
.env.player          # Player, cấu hình trên Vercel
.env.example         # mẫu, có commit
```

```bash
# .env.example
DATABASE_URL="postgresql://postgres:dev@localhost:5432/audio_truyen"
PLAYER_DATABASE_URL="postgresql://...@neon.tech/audio_truyen"   # DB hosted cho Player
REDIS_URL="redis://localhost:6379"

OLLAMA_URL="http://localhost:11434"
OLLAMA_MODEL_WRITE="qwen3:14b-q6_K"
OLLAMA_MODEL_UTILITY="qwen3:8b"

KOKORO_URL="http://localhost:8880"
VOICE_CLONE_URL="http://localhost:8881"

# Ngân sách VRAM (MB) — xem PLAN.md mục 3
VRAM_TOTAL_MB=16384
VRAM_RESERVED_MB=2048          # phần Windows desktop chiếm
VRAM_LLM_MB=12288
VRAM_TTS_CLONE_MB=4096

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET="audio-truyen"
R2_PUBLIC_URL="https://cdn.example.com"
```

---

## 10. `prompts/` và `scripts/`

```
prompts/                            # nguồn gốc, seed vào bảng Prompt
├── outline.md
├── write-scene.md
├── write-scene.kinh-di.md          # biến thể theo thể loại
├── write-scene.tinh-cam.md
├── audio-edit.md
├── summarize.md
└── metadata.md

scripts/
├── bench-llm.ts                    # đo tok/s các model — dùng ở Phase 0
├── bench-tts.ts                    # đo tốc độ + xuất file nghe thử
├── check-gpu.ts                    # xác nhận CUDA, VRAM trống
├── seed-voices.ts                  # quét voicepack có sẵn, ghi vào Voice
└── backup-db.sh                    # pg_dump → R2, chạy hàng ngày
```

`bench-llm.ts` và `bench-tts.ts` chính là công cụ để trả lời hai câu hỏi quyết định ở cuối Phase 0 (`setup-wsl2.md`) — **viết chúng trước khi viết bất kỳ phần nào của Studio.**

---

## 11. Thứ tự dựng code theo phase

| Phase | Dựng phần nào |
|---|---|
| **0** | `scripts/` (bench, check-gpu) — chỉ vậy thôi |
| **1** | `packages/config`, `packages/database` (schema + migration + seed) |
| **2** | `packages/llm`, `apps/worker` (làn LLM + job outline/write-scene/summarize), `apps/studio` (wizard bước 0–1) |
| **3** | `packages/tts` (Kokoro), `packages/audio` (concat + loudnorm), worker làn TTS_CPU + FFMPEG, Studio bước 2–3 |
| **4** | `apps/player` + `publish.job.ts` + DB hosted |
| **5** | `packages/tts` (adapter clone giọng), làn TTS_GPU, trang casting |
| **6** | `packages/audio` (mix, waveform, video), Studio bước 4–5 |
| **7** | RSS, chạy hàng loạt, tự động đăng TikTok |

**Đừng dựng sẵn package rỗng cho các phase sau.** Tạo package khi bắt đầu phase cần nó — thư mục rỗng chỉ gây nhiễu.

---

## 12. Lệnh khởi tạo

```bash
mkdir -p ~/audio-truyen && cd ~/audio-truyen   # trong WSL2, KHÔNG để ở /mnt/c
pnpm init
pnpm add -D turbo typescript @types/node

cat > pnpm-workspace.yaml <<'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

mkdir -p apps/{studio,player,worker} packages/{database,core,llm,tts,audio,config}
mkdir -p prompts scripts docs

# Studio và Player
pnpm create next-app@latest apps/studio --ts --tailwind --app --no-src-dir=false
pnpm create next-app@latest apps/player --ts --tailwind --app --no-src-dir=false

# Database
cd packages/database && pnpm add @prisma/client && pnpm add -D prisma
npx prisma init --datasource-provider postgresql
```

Chạy toàn bộ khi phát triển:
```bash
docker compose up -d          # Postgres + Redis
pnpm turbo dev                # studio + player + worker song song
```

---

## 13. Deploy — mỗi app một đường riêng

**Monorepo là một kho mã, không phải một đơn vị triển khai.** Ba app deploy hoàn toàn độc lập, và thực tế chỉ có **một** app được deploy:

| App | Deploy ở đâu | Cách chạy |
|---|---|---|
| `apps/player` | **Vercel** (hoặc Cloudflare Pages / VPS) | Build và deploy như một dự án Next.js bình thường |
| `apps/studio` | **Không deploy** | `pnpm dev` trong WSL2, mở `localhost:3000` từ trình duyệt Windows |
| `apps/worker` | **Không deploy** | Tiến trình nền trong WSL2 (pm2 hoặc systemd) |

Studio và worker chạy trên máy bạn nên **không bao giờ được build hay đẩy lên đâu cả**. Vercel không hề biết chúng tồn tại.

### 13.1. Cấu hình Vercel cho Player

Trong Project Settings:

| Mục | Giá trị |
|---|---|
| **Root Directory** | `apps/player` |
| Include files outside Root Directory | **Bật** (để truy cập được `packages/`) |
| Install Command | để trống — Vercel tự nhận `pnpm-workspace.yaml` ở gốc |
| Build Command | để trống — mặc định `next build` trong Root Directory |
| **Ignored Build Step** | `npx turbo-ignore` |

`turbo-ignore` là thứ đáng bật: nó **bỏ qua build khi commit không đụng tới `apps/player` hoặc các package mà Player phụ thuộc**. Sửa prompt, sửa worker, sửa job TTS — Vercel không build lại. Tiết kiệm thời gian và hạn mức build.

Biến môi trường trên Vercel (chỉ những thứ Player cần):

```bash
DATABASE_URL=<PLAYER_DATABASE_URL — Postgres hosted>
R2_PUBLIC_URL=https://cdn.example.com
NEXTAUTH_SECRET=...
```

> Player dùng `DATABASE_URL` trỏ vào **DB hosted**, không phải DB local. Không đưa `OLLAMA_URL`, `REDIS_URL`, hay khoá R2 ghi lên Vercel — Player chỉ đọc, không cần chúng.

### 13.2. Hai thứ phải nhớ khi share package

**Prisma client phải được generate lúc build.** Thêm vào `packages/database/package.json`:
```json
{ "scripts": { "postinstall": "prisma generate" } }
```

**Next.js phải biên dịch package workspace.** Trong `apps/player/next.config.ts`:
```ts
export default {
  transpilePackages: ["@audio/database", "@audio/core", "@audio/config"],
};
```

Lưu ý ba package này là **toàn bộ** những gì Player được phép import — `llm`, `tts`, `audio` bị chặn bằng ESLint (mục 8). Nếu bạn thấy phải thêm chúng vào `transpilePackages` thì tức là đã import nhầm ở đâu đó.

### 13.3. Chạy worker như dịch vụ nền

```bash
pnpm add -g pm2
cd ~/audio-truyen
pm2 start "pnpm --filter worker start" --name audio-worker
pm2 save
pm2 startup          # làm theo lệnh nó in ra
```

> **WSL2 không tự khởi động khi bật Windows.** Muốn worker chạy sau khi khởi động lại máy, tạo một task trong Windows Task Scheduler gọi `wsl -d Ubuntu-24.04 -u <user> -- pm2 resurrect` lúc đăng nhập. Nếu chỉ dùng khi ngồi vào máy làm việc thì bỏ qua, chạy tay khi cần.

### 13.4. Nếu sau này muốn tách hẳn thành nhiều repo

Cấu trúc này tách được mà không phải viết lại: publish các `packages/*` lên npm registry riêng tư (hoặc GitHub Packages), rồi mỗi app thành một repo import chúng như thư viện bình thường.

**Nhưng đừng làm sớm.** Ở quy mô một người vận hành, monorepo tiện hơn hẳn: sửa schema và cả ba app trong một commit, một lần `pnpm install`, không phải quản lý version giữa các repo. Chỉ tách khi có nhiều người làm song song trên các phần khác nhau.
