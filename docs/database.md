# Cấu trúc cơ sở dữ liệu

> Postgres 17 + Prisma. Đây là bản đầy đủ; schema trong [`PLAN.md`](../PLAN.md) mục 7 chỉ là phác thảo rút gọn.
> Copy phần schema ở mục 3 vào `prisma/schema.prisma` là chạy được.

---

## 1. Sơ đồ quan hệ

```
                    ┌──────────┐
                    │  Series  │  bộ truyện (truyện ngắn = series 1 tập)
                    └────┬─────┘
           ┌─────────────┼─────────────┬──────────────────┐
           │             │             │                  │
    ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼─────────────┐   │
    │  Episode   │ │ Character  │ │ PronunciationEntry│  │
    └──────┬─────┘ └─────┬──────┘ └──────────────────┘   │
           │             │                                │
    ┌──────┼─────────────┼──────────────┐          (storyBible JSON)
    │      │             │              │
┌───▼──┐ ┌─▼────┐   ┌────▼───┐    ┌─────▼────┐
│Scene │ │Block ├───┤ Voice  │    │  Export  │  mp3 / mp4 / wav
└──┬───┘ └─┬────┘   └────────┘    └──────────┘
   │       │
   │  ┌────▼──────┐
   │  │AudioAsset │  cache audio dùng chung nhiều tập
   │  └───────────┘
   │
┌──▼──────┐   ┌───────────┐   ┌────────────┐
│ LlmRun  │   │ RenderJob │   │   Prompt   │
└─────────┘   └───────────┘   └────────────┘
    telemetry     hàng đợi       prompt có version

─────────── phía người nghe ───────────
┌──────┐   ┌────────────────┐  ┌──────────┐  ┌─────────┐  ┌────────┐
│ User ├───┤ ListenProgress │  │ Favorite │  │ Comment │  │ Rating │
└──────┘   └────────────────┘  └──────────┘  └─────────┘  └────────┘
```

---

## 2. Mười quyết định thiết kế không hiển nhiên

Đây là những chỗ schema khác với bản phác thảo trong `PLAN.md`, kèm lý do.

### 2.1. Truyện ngắn cũng thuộc một `Series` — `Episode.seriesId` là bắt buộc

Phác thảo cũ để `seriesId` nullable (truyện ngắn = tập độc lập). Bản này bỏ nullable.

**Lý do:** nhân vật, casting giọng, từ điển phát âm đều thuộc về Series. Nếu truyện ngắn không có Series thì mỗi thứ trên phải có thêm nhánh "hoặc thuộc Episode" — nhân đôi số nhánh trong code và dễ sinh lỗi. Quan trọng hơn: **truyện ngắn ăn khách rất hay được viết tiếp thành truyện dài**, và khi đó bạn chỉ thêm tập, không phải di chuyển dữ liệu.

Từng có cột `Series.kind` (`SHORT`/`LONG`) để phân biệt hai loại. Đã bỏ: nó được suy ra từ số tập mà outline dựng, mà từ khi chuyển sang viết-từng-tập thì con số đó luôn là 1 — mọi truyện đều thành `SHORT`, kể cả bộ dài. Ranh giới thật nằm ở số tập đang có, và cái đó đếm được.

Studio tự tạo Series khi bạn làm truyện ngắn — người dùng không thấy bước này.

### 2.2. `storyBible` tách `world` (người viết) khỏi `raw` (AI sinh)

Cột `Series.storyBible` chứa bốn phần:

```ts
{
  raw:       Outline,        // dàn ý AI sinh — có thể sinh lại
  world:     WorldSetup,     // bối cảnh, luật thế giới, giọng văn, điều cấm, thuật ngữ
  direction: StoryDirection, // truyện đi về đâu — xem 2.2b
  bible:     string,         // bản render sẵn (chỉ để xem; lúc chạy luôn dựng lại từ dữ liệu mới nhất)
}
```

**Vì sao tách:** dàn ý là thứ AI sinh và bạn có thể cho sinh lại bất cứ lúc nào; thiết lập thế giới là thứ bạn quyết định và phải giữ nguyên suốt bộ truyện. Trộn chung thì mỗi lần sinh lại dàn ý sẽ xoá mất luật thế giới bạn đã viết.

### 2.2b. `direction` — truyện đi về đâu

Mọi thứ còn lại dàn ý sinh ra đều nói về **tập một**: tên truyện, bối cảnh, dàn nhân vật, một cái móc câu. Không chỗ nào nói truyện **kết** ở đâu, nên không prompt nào về sau nói được — model outline tập 30 đọc một cuốn Bible mô tả thế giới và dàn người, rồi mỗi lần tự bịa ra một hướng đi khác. Nhìn từ bên trong, đó chính là cái ta thấy là "truyện lan man".

Năm trường, mỗi trường trả lời một câu hỏi mà bước sau vốn đã hỏi:

| Trường | Trả lời câu hỏi |
|---|---|
| `endingDirection` | Kết ở đâu, theo chủ đề — cái gì đã đổi, và đổi với ai |
| `centralQuestion` | Câu hỏi mà đoạn kết buộc phải trả lời |
| `corePromise` | Mỗi tập cho người nghe cái gì — lý do quay lại, không phải lý do bắt đầu |
| `escalation` | Áp lực dâng ra sao: đầu truyện trả giá gì, giữa truyện, cuối truyện |
| `midpointTurn` | Lúc cách xoay xở cũ hết tác dụng và truyện sang số |

**Cố ý không phải số tập, số chương.** Đích đến là chuyện chủ đề; một con số chỉ dụ model nhồi cho tới đó hoặc dừng non, mà hệ này vốn mọc từng tập một.

Nằm cạnh `world` chứ không nằm trong `raw`: dàn ý viết nó một lần, từ đó trở đi nó là của người viết — mà `raw` mới là phần bản ghi này hứa có thể sinh lại.

`missingDirection()` chỉ kiểm **có mặt hay không**. "Kết ở đâu" có phải câu trả lời TỐT không thì code không phán được, và một cái cổng cho lọt văn vô nghĩa còn tệ hơn không có cổng.

`bible` được lưu để hiển thị, nhưng `buildSceneContext()` **luôn dựng lại từ `world` + nhân vật hiện tại** thay vì đọc bản cache — nếu không, sửa luật thế giới xong mà cảnh viết ra vẫn theo bản cũ.

### 2.3. Truyện dài: tóm tắt phân tầng + trạng thái nhân vật

Tóm tắt từng tập tích luỹ **tuyến tính**. Đo trên dữ liệu thật (tiếng Việt ~1,8 token/từ):

| Số tập | Tóm tắt (token) | Còn lại để sinh (num_ctx 16384) |
|---:|---:|---:|
| 20 | 7.200 | 5.243 |
| 30 | 10.800 | 1.643 ⚠ |
| 50 | 18.000 | **−5.557 ✖ tràn** |

Nên có hai cột mới, mỗi cột giải một vấn đề khác nhau:

**`Scene.storySoFar`** — cả câu chuyện gói trong một đoạn (trần 400 từ). Viết xong một scene thì gấp scene đó vào đoạn mà scene trước để lại, kết quả thay thế đoạn cũ — nên nó đứng yên một đoạn dù truyện dài ba scene hay ba trăm. Ngữ cảnh sau đó có trần cố định: đoạn cuộn dồn + `RECENT_SUMMARY_COUNT` tóm tắt gần nhất.

Lưu trên từng **scene** chứ không phải một cột trên `Series`: đó là trạng thái truyện tại đúng điểm ấy. Để một cột duy nhất thì viết lại một scene ở tập 2 sẽ gấp nó vào bản tóm tắt đã chứa tập 11, và model nối vào như thể chuyện vừa xảy ra.

Trước đây việc này do `Series.arcSummary` + job `ARC_SUMMARY` làm: nén các tập cũ từ **tóm tắt tập**, vài tập mới chạy một lần. Đã bỏ — nó trả lời đúng câu hỏi mà đoạn cuộn dồn trả lời, nhưng cách văn gốc hai bước nén thay vì một, và trễ vài tập. Nạp cả hai là đưa cùng một lịch sử vào hai lần, ~800 từ, qua hai chuỗi nén có quyền mâu thuẫn nhau.

**`Character.state` + `stateThroughEpisode`** — trạng thái hiện tại của nhân vật, tách khỏi `description`:

| Cột | Nội dung | Ai đặt | Có đổi không |
|---|---|---|---|
| `description` | Tính cách, cách nói | Người viết | Không — đây là bản sắc nhân vật |
| `state` | Đang ở đâu, biết gì, quan hệ đã đổi, còn sống không | Job `SUMMARIZE` tự cập nhật, sửa tay được | Có, sau mỗi tập |

**Vì sao `state` không thể nằm trong tóm tắt tập:** nén là mất mát. Thông tin kiểu "nhân vật này chết ở tập 12" rất dễ bị bỏ khi nén 8 tóm tắt thành 400 từ — và mất nó thì tập 40 sẽ cho người chết bước vào cảnh. Tách ra cột riêng thì nó luôn có mặt trong Story Bible, không phụ thuộc việc tóm tắt cũ còn hay mất.

### 2.4. `StoryFact` + pgvector: truy hồi sự kiện, KHÔNG embed tóm tắt

Đây là chỗ dễ làm sai nhất. Vector DB **không lưu tóm tắt** — nó lưu **sự kiện rời**, mỗi sự kiện một câu, một vector.

**Vì sao không embed `Episode.summary`:** một tóm tắt 200 từ gói 3–4 việc khác nhau. Dồn vào một vector là nhoè hết — truy vấn "quay lại bến xe" khớp yếu với tóm tắt mà phần lớn nói chuyện khác. Tách thành từng câu thì mỗi vector sắc nét, và lấy được 5 sự kiện từ 5 tập khác nhau thay vì 3 tóm tắt nguyên khối.

Phân công rõ ràng giữa các lớp:

| Lớp | Nội dung | Vai trò | Có vector |
|---|---|---|---|
| `Episode.gist` | 1 dòng ~15 từ | Mục lục — luôn nạp, rẻ | không |
| `Episode.summary` | 150–250 từ | Cho người đọc + tập liền sau | không |
| `Scene.storySoFar` | ~400 từ | Mạch chính, luôn nạp, viết lại sau **mỗi scene** | không |
| **`StoryFact`** | 1 câu / sự kiện | **Truy hồi theo ngữ nghĩa** | **có** |
| `Character.state` | 1–2 câu | Trạng thái hiện tại, luôn nạp | không |

**`FactKind` không phải để trang trí** — cách truy hồi khác nhau theo loại:

- `OPEN_THREAD` (tình tiết bỏ ngỏ) được nạp **bất kể độ tương đồng**. Đó là món nợ câu chuyện phải trả: một tình tiết bỏ ngỏ ở tập 3 vẫn cần nhắc ở tập 40 dù beat hiện tại chẳng liên quan gì về chủ đề. Tương đồng ngữ nghĩa không bắt được loại quan hệ đó.
- `pinned = true` cũng luôn được nạp — chỗ để người viết đè lên phán đoán của máy.
- Các loại còn lại: chỉ nạp khi vượt ngưỡng `FACT_MIN_SIMILARITY` (0.35). **Không lấy top-K vô điều kiện** — cảnh mở đầu một mạch mới thì đúng ra chẳng cần sự kiện cũ nào, lấy 6 sự kiện gần nhất chỉ làm model phân tán.

**Giới hạn cần biết:** vector search giỏi tìm sự kiện *cùng chủ đề*, kém tìm sự kiện *quan trọng về mặt cốt truyện*. Beat "Tài quay lại bến xe" khớp mọi sự kiện nhắc bến xe, trong khi cái đáng nhớ có thể là lời thề ở tập 12. Đó là lý do giữ cả mục lục (luôn có, rẻ) và cho ghim tay.

**Kỹ thuật:** cột `embedding vector(1024)` không khai báo được trong Prisma — tạo bằng SQL thô ở `packages/database/sql/001-vector.sql`, truy vấn bằng `$queryRaw`. Dùng `pgvector/pgvector:pg17` thay `postgres:17-alpine`. Embedding chạy **CPU** (bge-m3 qua Ollama) — nhúng một câu tốn vài ms, không đáng chiếm VRAM của model viết truyện.

### 2.5. `Character` là bảng riêng, không nhét trong `storyBible` JSON

Nhân vật được truy vấn và sửa thường xuyên (casting giọng, đổi tên, xem nhân vật nào xuất hiện ở tập nào). Để trong JSON thì mỗi lần sửa phải đọc–sửa–ghi cả khối, và không join được.

`storyBible` vẫn giữ lại cho phần tự do: luật thế giới, bối cảnh, giọng văn, ghi chú — những thứ chỉ ném nguyên vào prompt chứ không truy vấn.

### 2.6. `AudioAsset` tách khỏi `Block` — cache dùng chung giữa các tập

Phác thảo cũ đặt `cacheKey` unique ngay trên `Block`, nghĩa là cùng một câu ở hai tập khác nhau phải render hai lần.

Tách ra bảng riêng cho phép **dùng lại thật sự**: intro/outro cố định đọc một lần dùng cho cả bộ, các câu lặp ("Chương một", tên nhân vật xưng hô) cũng vậy. Với truyện dài 30 tập, khoản này tiết kiệm đáng kể thời gian render.

### 2.7. `Block` lưu **bản chụp** engine/voice, không phải khoá ngoại tới `Voice`

`Block.ttsEngine` và `Block.voiceId` là chuỗi thường, không FK.

**Lý do:** `cacheKey` được tính từ `hash(text + engine + voiceId + params)`. Nếu bạn đổi casting của nhân vật, giá trị hash phải đổi theo để hệ thống biết cần render lại. Dùng FK thì khi sửa bản ghi `Voice`, các block cũ trỏ tới bản ghi đã đổi nhưng file audio cũ vẫn nằm đó — cache trở nên sai mà không ai biết. Bản chụp làm cache tự động đúng.

### 2.8. `Export` là bảng riêng, không phải 3 cột URL trên `Episode`

Ba cột `tiktokUrl` / `audioUrl` / `broadcastUrl` không chứa nổi nhiều file cùng loại — mà một tập có thể cần nhiều bản xuất (mỗi nền tảng một mức LUFS, một tỉ lệ khung hình).

Bảng `Export` còn ghi thông số kỹ thuật thật của từng file (LUFS, sample rate, codec) — cần khi mỗi nền tảng đòi một mức chuẩn khác nhau.

### 2.9. `AudioTrack` có trường giấy phép bắt buộc

Plan xếp bản quyền nhạc nền vào nhóm rủi ro "trung bình" vì TikTok quét rất chặt. Nên `licenseType` là cột bắt buộc, và có giá trị `UNKNOWN` để đánh dấu track chưa xác minh — Studio chặn không cho dùng track `UNKNOWN` khi xuất bản.

### 2.10. `RenderJob.lane` phân theo tài nguyên, không phải theo loại việc

Có 4 làn: `LLM` (GPU), `TTS_CPU` (Kokoro), `TTS_GPU` (clone giọng), `FFMPEG`. Đây là ánh xạ trực tiếp của phần "phân luồng theo tài nguyên" ở mục 3 của plan — worker đọc `lane` và `vramMb` để quyết định có nhận job hay xếp hàng chờ.

---

## 3. Schema đầy đủ

> Đồng bộ từ `packages/database/prisma/schema.prisma`. Cột `embedding vector(1024)` của `StoryFact` không có ở đây — xem `sql/001-vector.sql`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // DB hosted mà Player đọc dùng CÙNG schema này, chỉ khác URL
  // (PLAYER_DATABASE_URL). Xem packages/database/src/client-player.ts.
}

// ══════════════════════════ ENUM ══════════════════════════

enum SeriesStatus {
  DRAFT
  ONGOING
  COMPLETED
  ARCHIVED
}

enum EpisodeStatus {
  IDEA
  OUTLINED
  DRAFTING
  DRAFTED
  SCRIPTED
  RENDERING
  READY
  PUBLISHED
  FAILED
}

enum TtsEngine {
  MOCK
  KOKORO
  PIPER
  VIXTTS
  F5TTS
}

enum VoiceTier {
  FAST
  EXPRESSIVE
}

enum JobLane {
  LLM
  TTS_CPU
  TTS_GPU
  FFMPEG
}

enum JobType {
  OUTLINE
  WRITE_SCENE
  AUDIO_EDIT
  SUMMARIZE
  METADATA
  TTS
  MIX
  VIDEO
  SUBTITLE
  PUBLISH
  MOCK
}

enum JobStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
  CANCELLED
}

enum ExportType {
  /// Bản chính hiện tại — MP3 chuẩn −16 LUFS (podcast/web).
  AUDIO_MP3
  /// Xuất cho nền tảng: hoãn. TikTok/YouTube đều yêu cầu VIDEO, không nhận MP3.
  TIKTOK_MP4
  YOUTUBE_MP4
  /// Kịch bản kèm timecode — hữu ích cho mô tả video và phụ đề.
  SCRIPT_TXT
}

enum PromptStep {
  OUTLINE
  WRITE_SCENE
  STORY_SO_FAR
  AUDIO_EDIT
  SUMMARIZE
  METADATA
}

enum AudioTrackKind {
  BGM
  SFX
  INTRO
  OUTRO
}

enum LicenseType {
  ROYALTY_FREE
  CC0
  CC_BY
  PURCHASED
  SELF_MADE
  UNKNOWN
}

/// Loại sự kiện. Quan trọng vì cách truy hồi khác nhau:
/// OPEN_THREAD được nạp BẤT KỂ độ tương đồng — đó là món nợ truyện phải trả.
enum FactKind {
  EVENT        // việc đã xảy ra
  REVELATION   // điều nhân vật phát hiện ra
  PROMISE      // lời thề, lời hứa, cam kết
  RELATION     // quan hệ giữa các nhân vật thay đổi
  OBJECT       // vật phẩm quan trọng
  PLACE        // địa điểm có ý nghĩa
  OPEN_THREAD  // tình tiết bỏ ngỏ, chưa có lời giải
}

enum ModerationStatus {
  PENDING
  APPROVED
  REJECTED
}

// ══════════════════ NỘI DUNG ══════════════════

model Series {
  id          String       @id @default(cuid())
  title       String
  slug        String       @unique
  description String?
  coverUrl    String?
  genre       String
  tags        String[]     @default([])
  status      SeriesStatus @default(DRAFT)

  /// Luật thế giới, bối cảnh, giọng văn. Nhân vật KHÔNG để ở đây — xem model Character.
  storyBible Json?

  aiDisclosure Boolean @default(true)

  episodes       Episode[]
  characters     Character[]
  pronunciations PronunciationEntry[]
  facts          StoryFact[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, updatedAt])
  @@index([genre])
}

model Episode {
  id       String @id @default(cuid())
  seriesId String
  series   Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  number Int
  title  String
  slug   String @unique

  outline Json?

  /// Tập này đóng lại bằng LOẠI bước ngoặt nào — xem HOOK_TYPES trong @audio/core.
  ///
  /// Là cột chứ không phải trường trong `outline`, vì câu hỏi đặt ra cho nó là "sáu tập
  /// gần nhất kết kiểu gì", mà đó là một truy vấn. `hook` là một câu về tập này; đây là
  /// thứ duy nhất của nó so sánh được với các tập khác.
  ///
  /// Null = outline trước khi có nhãn. Bị bỏ khỏi lịch sử chứ không hiện là "chưa rõ":
  /// một danh sách nửa là chỗ trống đọc như dữ liệu bị thiếu.
  hookType String?

  draftText  String?
  scriptText String?
  summary    String?
  /// Một dòng ~15 từ cho mục lục truyện. Luôn được nạp (rẻ), để hệ thống và
  /// người viết biết tập nào có gì — kể cả sau khi tóm tắt đã bị nén.
  gist       String?

  /// Chốt chặn: chưa duyệt thì không được chuyển sang bước tạo audio.
  humanReviewed Boolean   @default(false)
  reviewedAt    DateTime?
  reviewedBy    String?

  status     EpisodeStatus @default(IDEA)
  durationMs Int?
  wordCount  Int?

  bgmTrackId   String?
  bgmTrack     AudioTrack? @relation("EpisodeBgm", fields: [bgmTrackId], references: [id])
  bgmVolume    Float       @default(0.18)
  introTrackId String?
  outroTrackId String?

  publishedAt DateTime?

  scenes     Scene[]
  blocks     Block[]
  exports    Export[]
  facts      StoryFact[]
  llmRuns    LlmRun[]
  renderJobs RenderJob[]
  progress   ListenProgress[]
  favorites  Favorite[]
  comments   Comment[]
  ratings    Rating[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([seriesId, number])
  @@index([status])
  @@index([publishedAt])
  @@index([seriesId, publishedAt])
}

model Character {
  id       String @id @default(cuid())
  seriesId String
  series   Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  name        String
  role        String?
  description String?

  isNarrator Boolean @default(false)

  /// Trạng thái hiện tại: đang ở đâu, biết gì, quan hệ đã đổi thế nào.
  /// KHÁC `description` (tính cách, cách nói — tĩnh, do người viết đặt):
  /// `state` thay đổi theo mạch truyện và được cập nhật sau mỗi tập.
  state          String?
  /// Trạng thái phản ánh tới hết tập số mấy.
  stateThroughEpisode Int?

  voiceHint String?
  voiceId   String?
  voice     Voice?  @relation(fields: [voiceId], references: [id])

  blocks Block[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([seriesId, name])
  @@index([seriesId, isNarrator])
}

model Scene {
  id        String  @id @default(cuid())
  episodeId String
  episode   Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  order Int
  beat  String

  /// Cảnh này KHÔNG được làm gì, dù mạch truyện có mời gọi.
  ///
  /// Beat nói chuyện gì xảy ra; cảnh viết ra từ nó dài gấp hai ba chục lần, nên gần như
  /// mọi thứ trong cảnh hoàn chỉnh đều là thứ beat không yêu cầu. Tự do đó là cố ý, và
  /// cũng chính là chỗ model chạy quá đà — giải quyết nốt cái đáng lẽ phải để ngỏ, kết
  /// chương sớm hai cảnh, cho ai đó biết một điều chưa đến lúc biết. Đây là ranh giới
  /// của RIÊNG cảnh này; luật đúng cho cả truyện thì nằm ở `WorldSetup.constraints`.
  forbidden String[] @default([])

  /// Cần đối chiếu cảnh này với những gì trước khi viết — trạng thái ai đó còn đang mang,
  /// điều họ vẫn chưa biết.
  ///
  /// Có chồng lấn với Bible, đoạn cuộn dồn và các fact truy hồi, một cách cố ý. Giá trị
  /// của nó là chỉ ra một hai điều đáng kể Ở ĐÂY, giữa tất cả những thứ khác model đang
  /// giữ cùng lúc.
  continuity String[] @default([])

  text  String?

  /// Băm của mọi thứ cảnh này được viết RA TỪ — Bible, dàn nhân vật, beat, hai
  /// lớp setup, đoạn văn ngay trước nó, và prompt WRITE_SCENE.
  ///
  /// Tính lại khi mở trang tập; lệch nghĩa là cảnh được viết dựa trên tư liệu mà
  /// truyện đã đi khỏi. Không có nó thì không gì nhận ra: sửa Bible, gõ lại beat
  /// hay viết lại cảnh 2 đều để cảnh 3 trông mới y như ngày nó ra đời.
  ///
  /// Null = viết trước khi có cột này. Báo là "chưa rõ", không bao giờ báo là cũ.
  inputDigest String?

  /// Các lỗi cơ học tìm thấy trong chính văn — xem packages/core/prose-lint.
  ///
  /// Là sự thật, không phải phán quyết: không gì hành động theo nó, người đọc trên
  /// trang tập mới quyết. Ghi đè ở MỌI lần viết và viết lại, KỂ CẢ bằng danh sách
  /// rỗng — rỗng là cách một cảnh nói rằng lỗi đã hết.
  lintViolations Json?

  /// Số hiệu các tập cũ mà cảnh này gọi lại.
  /// Chỉ những tập được liệt kê ở đây mới được nạp tóm tắt ĐẦY ĐỦ — thay vì
  /// nhồi mọi tóm tắt vào mỗi lần gọi. Hệ thống gợi ý, người viết sửa được.
  refEpisodes Int[] @default([])

  approved Boolean @default(false)

  llmRuns LlmRun[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([episodeId, order])
}

/// Sự kiện truyện — đơn vị truy hồi theo ngữ nghĩa.
///
/// Vì sao KHÔNG embed `Episode.summary`: một tóm tắt 200 từ gói 3–4 việc khác
/// nhau, dồn vào một vector là nhoè hết. Tách thành từng câu một sự kiện thì
/// mỗi vector sắc nét, và lấy được 5 sự kiện từ 5 tập khác nhau thay vì 3 tóm
/// tắt nguyên khối.
///
/// Quan trọng hơn: sự kiện sống ĐỘC LẬP với việc nén tóm tắt. Đoạn cuộn dồn
/// viết lại sau mỗi scene và mất chi tiết mỗi lần; một sự kiện ghi ở tập 3 thì
/// tới tập 60 vẫn đúng y như thế.
///
/// Cột `embedding vector(1024)` không khai báo được trong Prisma — tạo bằng SQL
/// thô ở migration, truy vấn bằng `$queryRaw`. Xem packages/database/sql/.
model StoryFact {
  id       String @id @default(cuid())
  seriesId String
  series   Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  /// Tập sinh ra sự kiện này. Giữ cả số hiệu để truy vấn không cần join.
  episodeId     String?
  episode       Episode? @relation(fields: [episodeId], references: [id], onDelete: SetNull)
  episodeNumber Int

  kind FactKind
  /// Một câu, tự đứng được mà không cần ngữ cảnh.
  /// VD: "Tài thề không bao giờ quay lại Bến Cũ sau đêm mưa."
  text String

  /// Tình tiết bỏ ngỏ đã có lời giải chưa. Chỉ áp dụng cho OPEN_THREAD.
  resolved          Boolean @default(false)
  resolvedInEpisode Int?

  /// Người viết ghim thì luôn được nạp, bất kể độ tương đồng.
  pinned Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([seriesId, kind])
  @@index([seriesId, episodeNumber])
  @@index([seriesId, resolved])
}

// ══════════════════ AUDIO ══════════════════

model Voice {
  id     String    @id @default(cuid())
  engine TtsEngine
  tier   VoiceTier

  name            String
  externalVoiceId String
  refAudioUrl     String?

  gender    String?
  ageRange  String?
  accent    String?
  sampleUrl String?

  licenseType  LicenseType @default(UNKNOWN)
  commercialOk Boolean     @default(false)

  enabled Boolean @default(true)

  characters Character[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([engine, externalVoiceId])
  @@index([tier, enabled])
}

model Block {
  id        String  @id @default(cuid())
  episodeId String
  episode   Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  order Int
  text  String

  characterId  String?
  character    Character? @relation(fields: [characterId], references: [id])
  speakerLabel String

  /// Bản chụp cấu hình lúc render — CỐ TÌNH không dùng khoá ngoại.
  /// Đổi casting thì cacheKey đổi theo, hệ thống tự biết cần render lại.
  ttsEngine TtsEngine
  voiceId   String
  speed     Float     @default(1.0)
  pitch     Float?

  pauseAfter Int         @default(400)
  sfxHint    String?
  sfxTrackId String?
  sfxTrack   AudioTrack? @relation("BlockSfx", fields: [sfxTrackId], references: [id])

  audioAssetId String?
  audioAsset   AudioAsset? @relation(fields: [audioAssetId], references: [id])

  approved Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([episodeId, order])
  @@index([episodeId, approved])
  @@index([characterId])
}

/// Cache audio dùng chung mọi tập. Intro/outro cố định chỉ render một lần.
model AudioAsset {
  id String @id @default(cuid())

  /// sha256(text + ttsEngine + voiceId + speed + pitch)
  cacheKey String @unique

  /// KHOÁ trong kho ("series/abc/blocks/x.wav"), không phải đường dẫn tuyệt đối
  /// — xem README mục "File audio lưu ở đâu".
  url        String
  durationMs Int
  sizeBytes  Int
  sampleRate Int    @default(24000)

  ttsEngine TtsEngine
  voiceId   String

  refCount Int @default(0)

  blocks Block[]

  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())

  @@index([lastUsedAt])
}

model AudioTrack {
  id   String         @id @default(cuid())
  kind AudioTrackKind

  title      String
  /// Khoá trong kho khi tự tải lên, hoặc URL `https://` khi dán nguồn ngoài.
  url        String
  durationMs Int
  mood       String?
  tags       String[] @default([])

  /// Bắt buộc — UNKNOWN bị chặn khi xuất bản.
  licenseType LicenseType @default(UNKNOWN)
  licenseNote String?
  attribution String?

  episodesAsBgm Episode[] @relation("EpisodeBgm")
  blocksAsSfx   Block[]   @relation("BlockSfx")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([kind, licenseType])
}

model PronunciationEntry {
  id String @id @default(cuid())

  /// null = từ điển dùng chung mọi truyện
  seriesId String?
  series   Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  term        String
  replacement String
  isRegex     Boolean @default(false)
  note        String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([seriesId, term])
}

// ══════════════════ XUẤT BẢN ══════════════════

model Export {
  id        String  @id @default(cuid())
  episodeId String
  episode   Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  type ExportType

  part      Int @default(1)
  partTotal Int @default(1)

  /// Khoá trong kho, xem AudioAsset.url.
  url        String
  sizeBytes  Int?
  durationMs Int?

  sampleRate  Int?
  bitDepth    Int?
  bitrateKbps Int?
  lufs        Float?
  codec       String?

  platformUrl String?
  publishedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([episodeId, type, part])
  @@index([type, publishedAt])
}

// ══════════════════ AI & HÀNG ĐỢI ══════════════════

model Prompt {
  id      String     @id @default(cuid())
  step    PromptStep
  /// Biến thể theo thể loại. "*" = áp dụng cho mọi thể loại.
  /// Dùng "*" thay vì null vì Postgres coi mỗi NULL là khác nhau — ràng buộc
  /// duy nhất trên cột nullable sẽ không chặn được bản ghi trùng.
  genre   String     @default("*")
  version Int        @default(1)

  content String
  model   String?
  params  Json?

  active Boolean @default(true)
  note   String?

  llmRuns LlmRun[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([step, genre, version])
  @@index([step, active])
}

/// Telemetry mỗi lần gọi LLM. Ghi thời gian và tốc độ, không ghi tiền —
/// với model local, thời gian máy mới là tài nguyên khan hiếm.
model LlmRun {
  id String @id @default(cuid())

  episodeId String?
  episode   Episode? @relation(fields: [episodeId], references: [id], onDelete: SetNull)
  sceneId   String?
  scene     Scene?   @relation(fields: [sceneId], references: [id], onDelete: SetNull)
  promptId  String?
  prompt    Prompt?  @relation(fields: [promptId], references: [id], onDelete: SetNull)

  step   PromptStep
  model  String
  params Json

  inputTokens  Int
  outputTokens Int
  durationMs   Int
  tokensPerSec Float

  /// USD, theo đúng con số nhà cung cấp báo về — không tự nhân từ bảng giá ở đây.
  ///
  /// Null = không ai nói: model chạy local, hoặc gateway trả lời mà không kèm giá.
  /// KHÔNG phải 0. Model miễn phí tốn 0 và đang được đếm đúng; một chuỗi null nghĩa
  /// là hạn mức đang canh một chỗ trống, và batch-budget.ts nói ra điều đó.
  costUsd Float?

  /// Điểm bạn tự chấm sau khi đọc — để biết prompt/tham số nào cho văn hay.
  qualityRating Int?
  qualityNote   String?

  error String?

  createdAt DateTime @default(now())

  @@index([step, createdAt])
  @@index([model, qualityRating])
  @@index([episodeId])
}

enum BatchStatus {
  RUNNING
  WAITING_REVIEW   // đang chờ người đọc duyệt bản thảo — không job nào có trạng thái này
  DONE
  FAILED
  CANCELLED
}

/// Một lượt chạy hàng loạt cho cả bộ.
/// Điều phối bằng SỰ KIỆN: mỗi job xong thì worker xét trạng thái tập rồi đẩy
/// bước kế tiếp. Không dùng vòng lặp chờ vì nó chiếm chỗ trong làn.
model BatchRun {
  id       String @id @default(cuid())
  seriesId String
  series   Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  status BatchStatus @default(RUNNING)

  autoApprove Boolean @default(false)  // bỏ qua chốt duyệt — chỉ dùng khi thử
  withAudio   Boolean @default(true)   // chạy tiếp TTS + MP3, hay dừng sau kịch bản

  currentEpisodeId String?

  /// Tiêu tới ngần này USD cho truyện thì dừng. Null = không trần.
  ///
  /// Kiểm ở ranh giới giữa hai bước, không bao giờ giữa chừng: một lệnh gọi đã phát
  /// đi thì tiền đã mất dù job có xong hay không, cắt ngang chỉ mất thêm một cảnh.
  /// Nên số tiêu thật có thể vượt trần một chút — trần là chỗ RUN DỪNG, không phải
  /// giới hạn cứng lên hoá đơn.
  budgetUsd Float?
  /// Đã tiêu bao nhiêu từ lúc run bắt đầu, tính lại ở mỗi ranh giới.
  spentUsd  Float   @default(0)
  /// Đã cảnh báo "mấy lệnh gọi này không báo giá" cho run này chưa. Một lần là cảnh
  /// báo; mỗi ranh giới một lần là tiếng ồn.
  blindWarned Boolean @default(false)

  error String?

  startedAt  DateTime  @default(now())
  finishedAt DateTime?

  @@index([seriesId, status])
}

/// Một lượt thẩm duyệt tìm thấy gì trong bản nháp một tập — xem prompts/review.md.
///
/// Là bảng chứ không phải cột trên `Episode` vì bản thẩm duyệt vẫn đáng giữ sau khi tập
/// bị nó chê đã được viết lại: "trước nói rewrite, giờ nói accept" là bằng chứng duy nhất
/// cho thấy việc viết lại có tác dụng. Trang hiển thị bản mới nhất.
///
/// **Nó không quyết định gì.** Không chỗ nào đọc `verdict` để xếp việc, đổi trạng thái hay
/// duyệt bản nháp — người đọc rồi bấm những nút vốn đã có sẵn. Máy vừa phán chất lượng vừa
/// tự xếp việc viết lại là đã âm thầm gỡ mất cái cổng duy nhất của cả dây chuyền.
model RenderJob {
  id        String   @id @default(cuid())
  episodeId String?
  episode   Episode? @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  type   JobType
  lane   JobLane
  status JobStatus @default(QUEUED)

  /// VRAM job này cần. Job chạy CPU khai báo 0.
  vramMb Int @default(0)

  progress Int     @default(0)
  payload  Json?
  result   Json?
  error    String?

  attempts    Int @default(0)
  maxAttempts Int @default(3)

  queuedAt   DateTime  @default(now())
  startedAt  DateTime?
  finishedAt DateTime?

  @@index([status, lane, queuedAt])
  @@index([episodeId, status])
}

// ══════════════════ NGƯỜI NGHE ══════════════════

model User {
  id            String    @id @default(cuid())
  email         String?   @unique
  name          String?
  image         String?
  emailVerified DateTime?

  role String @default("listener")

  progress  ListenProgress[]
  favorites Favorite[]
  comments  Comment[]
  ratings   Rating[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ListenProgress {
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  episodeId String
  episode   Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  positionMs Int     @default(0)
  completed  Boolean @default(false)

  updatedAt DateTime @updatedAt

  @@id([userId, episodeId])
  @@index([userId, updatedAt])
}

model Favorite {
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  episodeId String
  episode   Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@id([userId, episodeId])
}

model Comment {
  id        String  @id @default(cuid())
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  episodeId String
  episode   Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  body        String
  timestampMs Int?

  status ModerationStatus @default(PENDING)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([episodeId, status, createdAt])
}

model Rating {
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  episodeId String
  episode   Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  score Int

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@id([userId, episodeId])
  @@index([episodeId])
}
```





> **Bảng của Auth.js** (`Account`, `Session`, `VerificationToken`) chưa có ở trên. Thêm theo tài liệu adapter Prisma của Auth.js khi làm Phase 4; chúng nối vào `User` đã có sẵn.

---

## 4. Vòng đời trạng thái của `Episode`

```
IDEA ──(sinh dàn ý 0a)──> OUTLINED ──(job WRITE_SCENE)──> DRAFTING
                                                              │
                                              (tất cả cảnh xong)
                                                              ▼
   PUBLISHED <──(đẩy lên R2)── READY <──(job MIX/VIDEO)── DRAFTED
                                 ▲                            │
                                 │                     (người duyệt:
                            RENDERING <──(job TTS)──   humanReviewed = true
                                                        + job AUDIO_EDIT 0c)
                                                              ▼
                                                          SCRIPTED
```

**Ràng buộc bắt buộc cưỡng chế ở tầng ứng dụng** (Prisma không làm được):

1. `DRAFTED → SCRIPTED` chỉ khi `humanReviewed = true`. Đây là chốt chặn không cho bản thảo thô lọt ra ngoài.
2. `READY → PUBLISHED` chỉ khi mọi `AudioTrack` được dùng có `licenseType != UNKNOWN`.
3. Job bất kỳ `FAILED` → Episode chuyển `FAILED`, giữ nguyên dữ liệu đã có để chạy lại phần lỗi.

---

## 5. Index & hiệu năng

Các index đã đặt trong schema, kèm truy vấn chúng phục vụ:

| Index | Phục vụ |
|---|---|
| `Series(status, updatedAt)` | Danh sách bộ truyện trong Studio |
| `Episode(seriesId, publishedAt)` | Danh sách tập ở trang truyện của Player |
| `Episode(publishedAt)` | Trang chủ "mới nhất" |
| `Block(episodeId, approved)` | Đếm tiến độ duyệt block |
| `AudioAsset(cacheKey)` unique | Tra cache trước mỗi lần render — truy vấn nóng nhất của pipeline |
| `AudioAsset(lastUsedAt)` | Dọn asset lâu không dùng |
| `RenderJob(status, lane, queuedAt)` | Worker lấy job kế tiếp theo làn |
| `LlmRun(model, qualityRating)` | So sánh model/prompt nào cho văn hay |
| `Comment(episodeId, status, createdAt)` | Hiển thị bình luận đã duyệt |

**Ghi chú về `PronunciationEntry`:** muốn `@@unique([seriesId, term])` nhưng Postgres coi mỗi `NULL` là khác nhau, nên từ điển chung (`seriesId = null`) vẫn thêm trùng được. Xử lý bằng partial unique index viết tay trong migration:

```sql
CREATE UNIQUE INDEX pronunciation_global_term_key
  ON "PronunciationEntry" (term) WHERE "seriesId" IS NULL;
CREATE UNIQUE INDEX pronunciation_series_term_key
  ON "PronunciationEntry" ("seriesId", term) WHERE "seriesId" IS NOT NULL;
```

---

## 6. Dữ liệu khởi tạo (seed)

Chạy `prisma db seed` để nạp:

1. **`Voice`** — mỗi voicepack Kokoro/Piper tìm được ở Phase 0 một bản ghi, điền `licenseType` và `commercialOk` ngay lúc thêm chứ đừng để sau.
2. **`Prompt`** — 5 prompt mặc định (`OUTLINE`, `WRITE_SCENE`, `AUDIO_EDIT`, `SUMMARIZE`, `METADATA`) với `genre = null`, cộng biến thể `WRITE_SCENE` cho từng thể loại chính.
3. **`PronunciationEntry`** toàn cục — số đếm, đơn vị, các từ vay mượn hay gặp ("wifi", "email", "taxi", "internet").
4. **`AudioTrack`** — intro/outro của kênh.
5. **`User`** admin đầu tiên.

---

## 7. Những thứ cố tình chưa đưa vào

Ghi lại để sau này không phải tranh luận lại:

| Thứ | Lý do hoãn |
|---|---|
| Bảng phân tích lượt nghe chi tiết (heatmap nghe tới đâu bỏ) | Thuộc Phase 8. `ListenProgress` đủ cho nhu cầu hiện tại. |
| Lịch sử phiên bản bản thảo | `LlmRun` đã lưu đủ để truy vết. Thêm version đầy đủ khi thật sự cần quay lại bản cũ. |
| Đa ngôn ngữ (i18n) | Chỉ làm tiếng Việt. Thêm cột `locale` khi có nhu cầu thật. |
| Soft delete | Xoá thật + backup hàng ngày lên R2 là đủ ở quy mô này. |
| Phân quyền chi tiết | `User.role` dạng chuỗi đủ dùng cho 1–2 người vận hành. |

---

## 8. Lệnh thường dùng

```bash
# Sinh lại Prisma client cho khớp schema
pnpm db:generate

# Tạo migration sau khi sửa schema
npx prisma migrate dev --name mo_ta_thay_doi

# Đẩy schema lên DB mà không tạo migration (chỉ dùng lúc đang nghịch)
npx prisma db push

# Xem dữ liệu bằng giao diện
npx prisma studio

# Nạp seed
npx prisma db seed

# Backup (chạy hàng ngày, đẩy lên R2 — xem mục rủi ro trong PLAN.md)
docker compose exec -T postgres pg_dump -U postgres audio_truyen | gzip > backup-$(date +%F).sql.gz
```

> **`git pull` về một model mới thì cần cả hai bước: sinh lại client VÀ đẩy
> schema lên DB.** `prisma generate` chỉ tự chạy lúc cài gói (`postinstall`),
> nên client cũ vẫn nằm nguyên đó sau khi pull; `prisma.genre` khi đó bằng
> `undefined` và Node báo `Cannot read properties of undefined (reading
> 'findMany')`, một câu không nhắc gì tới Prisma. `turbo` đã lo bước sinh lại
> giúp — `pnpm dev`, `pnpm build`, `pnpm test`, và cả `pnpm api` / `worker` /
> `studio` / `player` đều chạy `@audio/database#build` trước, nên bốn lệnh chạy
> lẻ từng app cũng phải đi qua `turbo` chứ không gọi thẳng `pnpm --filter`.
> Còn `pnpm db:push` thì vẫn phải gõ tay vì nó ghi vào DB thật — nó tự chạy
> `db:ext` (bật pgvector) rồi `db:prune` (xoá các dòng còn giữ giá trị enum sắp bị
> bỏ) trước khi đẩy, vì Postgres từ chối bỏ một nhãn enum khi còn dòng nào dùng nó
> và Prisma báo việc đó ra thành "push lỗi" chứ không nói phải xoá dòng trước. Chạy
> thiếu bước nào cũng có lời nhắc kèm đúng lệnh: `@audio/database` kiểm client
> ngay lúc dựng nó, nên mọi tiến trình chạy từ mã nguồn — API, worker,
> `pnpm story`, `db:seed` — đều dừng kèm chỉ dẫn thay vì chết bằng TypeError;
> còn DB đi sau code thì API trả về chỉ dẫn: bảng thiếu là P2021, cột thiếu là
> P2022, còn **giá trị enum thiếu thì không có mã Prisma nào** — Postgres từ chối
> bằng SQLSTATE 22P02 và Prisma gói lại thành "unknown request error", nên chỗ đó
> phân loại theo câu chữ Postgres viết. Trường hợp này xảy ra khi đã sinh lại client
> mà chưa `db:push`: code biết giá trị mới, database thì chưa.
