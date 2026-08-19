# Audio Truyện

Phần mềm sản xuất truyện audio bằng model chạy tại chỗ: **LLM viết truyện → kịch bản audio → TTS đọc → trộn nhạc → xuất bản**.

Tài liệu: [`PLAN.md`](PLAN.md) · [`docs/database.md`](docs/database.md) · [`docs/project-structure.md`](docs/project-structure.md) · [`docs/setup-wsl2.md`](docs/setup-wsl2.md)

---

## Trạng thái: Phase 6 xong

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nền monorepo, Prisma, Postgres + Redis, hàng đợi phân làn có ngân sách VRAM | ✅ |
| 2 | LLM viết truyện: dàn ý → cảnh → kịch bản audio → tóm tắt | ✅ |
| 2b | pgvector: truy hồi sự kiện theo ngữ nghĩa | ✅ |
| 3 | TTS + ghép audio → MP3 | ✅ |
| 4 | Player — trang nghe | ✅ |
| — | ~~Đa giọng nhân vật~~ | hoãn — xem có cần không |
| 5 | Nhạc nền + ducking | ✅ |
| 6 | Truyện dài: chạy hàng loạt, RSS podcast | ✅ |
| 8 | Nâng cao: hiệu ứng âm thanh, nghe offline | ✅ một phần — xem dưới |
| — | Xuất cho nền tảng (TikTok/YouTube — đều cần video) | hoãn |

**Yêu cầu ngoài Node: `ffmpeg`** (`brew install ffmpeg` / `apt install ffmpeg`). Worker kiểm tra lúc khởi động và báo nếu thiếu filter.

**LLM và TTS đang chạy provider giả lập** (`LLM_PROVIDER=mock`, `TTS_PROVIDER=mock`) nên toàn bộ pipeline chạy được mà chưa cần GPU. Khi có model thật, đổi hai biến này trong `.env`.

---

## Chạy lần đầu

```bash
pnpm install
cp .env.example .env         # sửa nếu cổng bị trùng
pnpm infra:up                # Postgres + Redis
pnpm db:push                 # tạo bảng
```

Bốn terminal:

```bash
pnpm worker    # tiêu thụ hàng đợi — LLM, TTS, ffmpeg
pnpm api       # API của Studio, cổng 3002
pnpm studio    # giao diện Studio, http://localhost:3000
pnpm player    # trang nghe, http://localhost:3001 (mở được từ điện thoại cùng mạng)
```

Chạy production thì chỉ cần hai: `pnpm build` rồi `pnpm worker` + `pnpm api` — API phục vụ luôn bản build của Studio ở cổng 3002.

> Cổng mặc định của Postgres/Redis là **5433 / 6380**, không phải 5432 / 6379 — tránh đụng dự án khác đang chạy trên cùng máy.

---

## Viết một truyện

```bash
pnpm story "một tài xế xe khách đêm chở phải hành khách đã chết từ ba năm trước"
pnpm story "..." --genre="trinh thám" --episodes=3
pnpm inspect                 # xem toàn bộ dữ liệu vừa sinh
```

Hoặc dùng giao diện: `http://localhost:3000/series/new`.

Chuỗi chạy: **ý tưởng → dàn ý (JSON có schema) → viết từng cảnh → [người duyệt] → kịch bản audio + tách block → tóm tắt**.

Script dừng lại ở bước duyệt — đó là chốt chặn duy nhất ngăn bản thảo thô đi tiếp. Thêm `--auto-approve` để bỏ qua khi đang thử.

### Ba tầng để AI viết theo ý bạn

Từ hẹp tới rộng — thứ nào cụ thể hơn thì thắng:

| Tầng | Ở đâu | Áp cho | Dùng khi |
|---|---|---|---|
| **Story Bible** | `/series/[id]/bible` | một bộ | Bối cảnh, luật thế giới, giọng văn, điều cấm, thuật ngữ. Nạp vào `system` của **mọi** lần viết cảnh. |
| **Biến thể prompt theo thể loại** | `/prompts` | mọi bộ cùng thể loại | "Truyện kinh dị thì nhịp chậm, không giải thích hiện tượng lạ" — thứ đúng cho cả thể loại chứ không riêng một bộ. |
| **Prompt mặc định** | `/prompts` | tất cả | Khung chung: số từ, ngôi kể, thì, cách mở đầu. |

Không cần thêm khái niệm mới để "dạy" AI viết khác đi — chọn đúng tầng. Sửa một bộ thì vào Story Bible; sửa cả thể loại thì tạo biến thể prompt.

### Thiết lập thế giới (quan trọng với truyện dài)

Truyện dài 30 tập trôi khỏi thiết lập ban đầu là chuyện thường. Chỗ chống lại điều đó là **Story Bible** — `/series/[id]/bible`:

| Mục | Việc |
|---|---|
| Bối cảnh | Thời gian, địa điểm, không khí |
| **Luật thế giới** | Những điều LUÔN đúng. VD: "Ma chỉ xuất hiện sau nửa đêm" |
| Giọng văn | Cách kể mong muốn |
| Điều cấm | Những thứ không được xuất hiện |
| Thuật ngữ | Tên riêng, cách gọi — giữ cho AI không đổi giữa các tập |

Toàn bộ phần này nạp vào `system` prompt của **mọi** lần viết cảnh, tóm tắt và biên tập audio.

Đặt được ở hai thời điểm:
- **Trước khi dựng dàn ý** — mục "Thiết lập thế giới trước" trong form tạo truyện. AI buộc phải bám theo ngay từ dàn ý.
- **Sau đó, bất cứ lúc nào** — trang Story Bible, có ô xem trước đúng thứ AI sẽ đọc.

Hai phần tách nhau trong DB: sửa luật thế giới **không** làm mất dàn ý, và sinh lại dàn ý **không** làm mất luật thế giới.

### Truyện dài: truy hồi thay vì nhồi

Vector DB **không lưu tóm tắt — nó lưu sự kiện**. Mỗi sự kiện một câu, một vector. Khi viết cảnh, hệ thống chỉ lấy sự kiện liên quan tới beat của cảnh đó.

| Lớp | Nội dung | Có vector | Khi nào nạp |
|---|---|---|---|
| `Episode.gist` | 1 dòng | không | luôn (mục lục, rẻ) |
| `Episode.summary` | 150–250 từ | không | chỉ tập liền trước |
| `Series.arcSummary` | ~400 từ | không | luôn |
| **`StoryFact`** | 1 câu / sự kiện | **có** | **khi liên quan tới beat** |
| `Character.state` | 1–2 câu | không | luôn |

Lý do không embed tóm tắt: một tóm tắt 200 từ gói 3–4 việc khác nhau, dồn vào một vector là nhoè hết. Tách từng câu thì mỗi vector sắc nét, và lấy được 5 sự kiện từ 5 tập khác nhau thay vì 3 tóm tắt nguyên khối.

**Không lấy top-K vô điều kiện** — có ngưỡng tương đồng 0.35:

```
"Tài quay lại Bến Cũ"              → 0.645  [lời thề, tập 5]
"chiếc vé xe cũ"                   → 0.632  [vật, tập 3]
"chuyện thời tiết ngoài biển khơi"  → 0 kết quả
```

Cảnh mở đầu một mạch mới thì đúng ra chẳng cần sự kiện cũ nào.

**Hai loại luôn được nạp bất kể tương đồng:** `OPEN_THREAD` (tình tiết bỏ ngỏ — món nợ truyện phải trả, tập 3 vẫn cần nhắc ở tập 40) và sự kiện người viết **ghim**. Tương đồng ngữ nghĩa không bắt được hai loại quan hệ này.

**Giới hạn cần biết:** vector search giỏi tìm sự kiện *cùng chủ đề*, kém tìm sự kiện *quan trọng về cốt truyện*. Đó là lý do vẫn giữ mục lục và cho ghim tay.

Quản lý ở `/series/[id]/facts`.

### Truyện dài: ngữ cảnh phải có trần

Tóm tắt từng tập tích luỹ tuyến tính — khoảng **tập 35 là tràn** `num_ctx` 16384. Nên ngữ cảnh chia bốn tầng, không tầng nào tăng theo số tập:

| Tầng | Nội dung | Trần |
|---|---|---|
| 1 | Story Bible: thế giới, luật, nhân vật **+ trạng thái hiện tại** | cố định |
| 2 | Mạch truyện từ đầu — các tập cũ đã nén | ~400 từ |
| 3 | Tóm tắt 3 tập gần nhất, nguyên văn | 3 tập |
| 4 | Cảnh liền trước, toàn văn | 1 cảnh |

Đo trên bộ 12 tập: ngữ cảnh phẳng ở **~1.775 token** thay vì tăng dần. Job `ARC_SUMMARY` tự chạy khi tóm tắt chưa nén vượt ngưỡng.

**Trạng thái nhân vật tách riêng khỏi tóm tắt** (`Character.state`). Nén là mất mát — thông tin kiểu "nhân vật này chết ở tập 12" rất dễ bị bỏ khi nén 8 tóm tắt thành 400 từ, và mất nó thì tập 40 sẽ cho người chết bước vào cảnh. Job tóm tắt tự cập nhật sau mỗi tập; sửa tay được ở trang Nhân vật.

Phân biệt hai cột dễ nhầm:

| Cột | Nội dung | Có đổi không |
|---|---|---|
| `description` | Tính cách, cách nói | Không — bản sắc nhân vật |
| `state` | Đang ở đâu, biết gì, còn sống không | Có, sau mỗi tập |

### Vì sao viết theo cảnh chứ không viết cả tập

Chất lượng model 14B tụt rõ sau khoảng 1.500 token liên tục. Viết theo cảnh 600–900 từ vừa giữ được chất lượng, vừa cho phép sinh lại một cảnh thay vì bỏ cả tập.

### Đổi sang model thật

```bash
# .env
LLM_PROVIDER=ollama
OLLAMA_MODEL_WRITE=qwen3:14b
EMBED_PROVIDER=ollama          # cần: ollama pull bge-m3
```

Embedding chạy **CPU** — nhúng một câu tốn vài ms, không đáng chiếm VRAM của model viết truyện. Cùng lý do đã đặt Kokoro lên CPU.

Không phải sửa dòng code nào. Provider giả lập sinh văn bản giữ chỗ có đúng hình dạng dữ liệu — đủ để kiểm chứng đường đi, **không dùng để đánh giá chất lượng văn**.

## Ra file MP3

`pnpm story` giờ chạy trọn tới MP3:

```
đọc audio…        1 block đọc mới, 3 từ cache
ghép + xuất MP3…  MP3: 0.3 phút, 0.4 MB
```

Hoặc qua giao diện: trang tập → **Audio** → nghe từng block, duyệt, xuất MP3.

Thêm `--no-audio` nếu chỉ muốn phần văn bản.

### Cache audio là trục chính

Khoá là `sha256(text + engine + voice + speed + pitch)`, lưu ở `AudioAsset` **dùng chung mọi tập**:

- Intro/outro cố định đọc một lần cho cả bộ
- Sửa một block chỉ render lại đúng block đó
- Đo thực tế: 4 block trùng nội dung → 1 file, `refCount=4`

Đổi casting giọng **không làm hỏng audio đã render** — `Block` giữ bản chụp `voiceId`, nên cacheKey cũ vẫn trỏ đúng file cũ. Muốn áp giọng mới thì "đọc lại toàn bộ".

### Chuẩn hoá loudness

MP3 xuất ở **−16 LUFS** (chuẩn web/podcast), dùng `loudnorm` hai lượt — lượt một đo, lượt hai áp. Một lượt kém chính xác rõ rệt trên file dài.

Đo lại file thật: **−16.4 LUFS** (tập có nhạc nền), 160 kbps, 44.1kHz mono. Lượt hai chạy `linear=true` nên chỉ dịch nguyên khối một mức gain — không bóp dynamic range, thứ nghe rõ nhất ở chỗ chuyển giữa đoạn có lời và đoạn chỉ có nhạc.

### Từ điển phát âm

Áp **trước** khi vào engine, vì G2P tiếng Việt của các engine local hay sai tên riêng và từ vay mượn. Quy tắc dài áp trước quy tắc ngắn — nếu không thì "Bến Cũ" bị quy tắc "Bến" ăn mất một nửa. Quy tắc riêng của bộ đè lên quy tắc chung.

Hiện chỉ nạp qua `pnpm db:seed` (5 từ vay mượn dùng chung: wifi, email, taxi, internet, video). **Chưa có giao diện** — và chưa cần: TTS giả lập không đọc chữ nên từ điển không đổi được gì bạn nghe thấy. Phần cần giao diện là mục riêng từng bộ (tên nhân vật, địa danh), mà chỉ biết cần thêm gì sau khi nghe engine thật đọc sai.

### Một giọng cho cả bộ

Hiện dùng **một giọng duy nhất** cho mọi block. Chọn ở trang Nhân vật → *Giọng mặc định*. Casting riêng từng nhân vật vẫn có sẵn nhưng chỉ có tác dụng khi làm đa giọng — hoãn cho tới khi thấy thật sự cần.

Việc này bỏ được kha khá phức tạp: **không cần TTS trên GPU**, nên làn `TTS_GPU` nằm không, và mâu thuẫn VRAM giữa LLM Q6 (12GB) với engine clone giọng (4GB) biến mất — chạy Qwen3 14B Q6 thoải mái.

Quan trọng hơn: **rủi ro giấy phép lớn nhất của cả dự án cũng mất theo.** Kokoro (Apache 2.0) và Piper (MIT) đều dùng thương mại được; chỉ engine clone giọng (viXTTS/XTTS-v2) mới vướng.

### Đổi sang TTS thật

```bash
# .env
TTS_PROVIDER=kokoro      # hoặc piper
KOKORO_URL=http://localhost:8880
```

Rồi thêm giọng thật vào bảng `Voice` (`engine=KOKORO`, `externalVoiceId` là ID mà engine hiểu) và chọn làm giọng mặc định của bộ.

**Engine ghi vào block lấy từ bản ghi `Voice`, không từ `.env`** — nên tập cũ render bằng mock vẫn giữ nguyên audio cũ, chỉ tập mới dùng engine mới.

Kokoro khai báo `vramMb = 0` vì chạy CPU — làn `TTS_CPU` không tranh VRAM với LLM, nên đọc tập N song song với viết tập N+1.

## Prompt

`/prompts` — sáu bước gọi model, mỗi bước một prompt.

Mỗi bước có bản **mặc định** (`genre = "*"`) dùng cho mọi thể loại, và có thể thêm **biến thể theo thể loại**. Biến thể luôn thắng bản mặc định khi bộ đúng thể loại đó; cùng thể loại thì `version` cao thắng. Tạo biến thể là chép từ bản mặc định — sửa từ bản đang chạy tốt an toàn hơn viết lại từ trang trắng.

**Biến trong prompt được kiểm ngay lúc lưu.** Mỗi bước chỉ truyền vào một số biến nhất định; dùng biến ngoài danh sách thì `renderTemplate` ném lỗi, mà lúc đó là đang giữa chừng một lượt viết dài. Studio chặn trước, và trang sửa hiện rõ biến nào đang dùng, biến nào bỏ phí.

| Bước | Biến truyền vào |
|---|---|
| `OUTLINE` | `idea` `genre` `episodeCount` `sceneCount` `sceneWords` `world` |
| `WRITE_SCENE` | `context` — gộp Story Bible, tóm tắt cung truyện, sự kiện truy hồi, cảnh trước, beat, số từ đích |
| `AUDIO_EDIT` | `characters` `draft` |
| `SUMMARIZE` | `characters` `text` |
| `ARC_SUMMARY` | `maxWords` `previousArc` `summaries` |
| `METADATA` | `text` |

Tham số sinh (`temperature`, `numCtx`…) sửa cùng chỗ. `temperature` cao thì văn biến hoá hơn nhưng dễ lạc — bước biên tập và tóm tắt để thấp. Bản mặc định không tắt và không xoá được: mọi thể loại chưa có biến thể đều rơi về nó.

---

## Nhạc nền

Thư viện nhạc ở `/tracks`. Chọn nhạc cho từng tập ở trang Audio của tập, rồi bấm **Xuất lại MP3** — lưu lựa chọn không tự dựng lại tập.

Nhạc được trộn dưới lời bằng **ducking** (`sidechaincompress`): nhạc tự nhỏ lại khi có lời, tự to lên ở khoảng lặng. Đo thực tế: lời ở RMS −14 dBFS kéo nhạc xuống ~8 dB. Vặn nhạc nhỏ cố định không thay được — hoặc lời bị lấn, hoặc nhạc nhỏ tới mức vô nghĩa.

Trộn xảy ra **trước** khi chuẩn hoá loudness, không phải sau: loudnorm phải đo được bản hoàn chỉnh, chứ chuẩn hoá lời rồi mới chồng nhạc lên là đẩy tập vượt mức đã chuẩn hoá.

| Điều cần biết | |
|---|---|
| Âm lượng nền | Mức nhạc ở đoạn KHÔNG có lời. Mặc định 18%. Ducking trừ tiếp từ mức này. |
| Nhạc ngắn hơn tập | Tự lặp. Chỗ nối **không** crossfade nên nghe thấy được — Studio báo trước số vòng lặp. Track dài xấp xỉ tập là sạch nhất. |
| Nhạc dài hơn tập | Cắt theo độ dài tập, có fade in 2s / fade out 4s. |
| Giấy phép | `UNKNOWN` không chặn lúc thêm vào thư viện, nhưng **chặn xuất bản**. Điền trước khi đưa vào tập. |

Với `STORAGE_DRIVER=local` thì tải file thẳng lên Studio. Với `r2` thì Studio không có credential — tải lên R2 rồi dán URL công khai.

---

## Studio: SPA + API

```
apps/studio  — Vite + React (SPA thuần, không có gì chạy phía server)
apps/api     — Hono. Prisma + BullMQ chỉ nằm ở đây và ở worker.
apps/player  — Next.js. Render phía server vì cần SEO, thẻ meta và RSS.
apps/worker  — tiêu thụ hàng đợi: LLM, TTS, ffmpeg.
```

Studio chỉ mình bạn dùng, trên localhost, nên không cần render phía server. Giao diện gọi `/api/...`; lúc dev Vite proxy sang cổng 3002, lúc chạy production API phục vụ luôn bản build.

**Quy ước lỗi** giữa hai bên (`apps/api/src/lib/http.ts`):

| | |
|---|---|
| `400` kèm `{ error }` | Lỗi người dùng gặp trong lúc dùng bình thường và tự xử lý được — chưa duyệt bản thảo, track còn tập đang dùng, prompt sai biến. Giao diện hiện nguyên văn tại chỗ, giữ nguyên thứ đang gõ dở. |
| `500` | Bug. Thông báo chung, chi tiết nằm ở log API. |

`UserError` là ranh giới: ném nó thì thành 400, ném gì khác thì thành 500.

---

## Hai cơ sở dữ liệu

```
Studio + worker ──► DATABASE_URL         (local, đầy đủ — KHÔNG rời máy)
                          │
                          │  job PUBLISH, một chiều
                          ▼
Player          ──► PLAYER_DATABASE_URL  (hosted, chỉ nội dung đã xuất bản)
```

DB local giữ bản thảo, Story Bible, prompt, telemetry, sự kiện truy hồi. Bấm **Xuất bản** ở Studio thì job `PUBLISH` đẩy sang DB hosted đúng những gì `packages/database/src/publish-scope.ts` cho phép. Gỡ xuất bản thì gỡ luôn khỏi hosted.

| | |
|---|---|
| Bảng được đồng bộ | `Series` `Episode` `Character` `Block` `Export` — mọi bảng khác **mặc định không**, nên thêm bảng mới vào schema không làm nó tự lọt ra ngoài |
| Cột không bao giờ rời máy | `Series.storyBible` · `Episode.draftText` `outline` `reviewedBy` `reviewedAt` · `Character.description` · `Block.speed` `pitch` `approved` `sfxHint` |
| `Block.text` **được** đi | Đó là lời đã duyệt, đúng những gì phát ra trong MP3 — trang nghe dùng cho mục "Đọc lời truyện". Khác hẳn `draftText` là bản thảo thô. |
| Cột bị xoá về null | `defaultVoiceId` `voiceId` `bgmTrackId` `introTrackId` `outroTrackId` — khoá ngoại trỏ sang bảng không đồng bộ, copy nguyên là vi phạm ràng buộc bên hosted |

**Chạy tại chỗ:** để `PLAYER_DATABASE_URL` trống thì Player dùng luôn DB local. Tiện lúc dựng app, nhưng lúc đó **không còn ranh giới nào** — Player nhìn thấy cả bản thảo, chỉ là không truy vấn tới. Trước khi deploy Player ra ngoài phải đặt biến này rồi chạy:

```bash
pnpm db:push:player     # đẩy schema sang DB hosted + kiểm bảng chỉ-local phải rỗng
```

Schema đẩy sang là schema **đầy đủ**, nên bảng `Prompt`, `LlmRun`, `Scene`… vẫn tồn tại ở hosted — chỉ là luôn rỗng. Đây là đánh đổi có ý thức: giữ một schema duy nhất thay vì hai bản phải đồng bộ tay. `db:push:player` kiểm và báo lỗi nếu chúng có dòng nào.

**Còn thiếu để deploy thật:** `Export.url` đang là khoá trong kho local, Player trên Vercel không đọc được đĩa của bạn. Cần `STORAGE_DRIVER=r2` để URL là `https://` — driver R2 chưa cài.

---

## File audio lưu ở đâu

Trong DB lưu **khoá trong kho**, không phải đường dẫn tuyệt đối:

```
series/<seriesId>/blocks/<cacheKey>.wav      ← block đã đọc
series/<seriesId>/episodes/<slug>.mp3        ← bản xuất
library/bgm/<tên-file>                       ← nhạc nền tải lên
```

Gốc kho là `STORAGE_LOCAL_DIR` giải theo `apps/worker` (mặc định `apps/worker/data/storage`). Studio và Player trỏ ngược lại đúng gốc đó.

Vì sao không lưu đường dẫn tuyệt đối: bản đầu lưu `file:///Users/.../audio/...`, và chỉ cần đổi tên thư mục dự án là **toàn bộ audio đã sinh mất tham chiếu** — file vẫn nằm trên đĩa nhưng không tra ra được. Chuyển từ macOS sang WSL2 cũng hỏng y hệt. Lưu khoá thì đổi tên, chuyển máy, đổi `STORAGE_LOCAL_DIR` đều không ảnh hưởng.

Cột `url` giữ hai dạng, phân biệt bằng tiền tố:

| Giá trị | Nghĩa |
|---|---|
| `series/...` | khoá trong kho — giải theo gốc hiện tại |
| `https://...` | nguồn ngoài: R2, hoặc URL nhạc nền người dùng dán |
| `file:///...` | **dạng cũ**, còn đọc được nhưng nên chạy `pnpm fix:storage-refs --apply` để dọn |

Trình duyệt không mở được file trên đĩa nên hai app phục vụ qua `/api/audio?key=...`, có chặn path traversal.

---

## Nghe thử

Player chạy ở `localhost:3001`, bind `0.0.0.0` nên **mở được từ điện thoại cùng mạng LAN** — cách nhanh nhất để nghe thử trên loa/tai nghe thật:

```bash
ipconfig getifaddr en0     # macOS
hostname -I                # Linux/WSL2
# → http://192.168.1.x:3001
```

### Chỉ tập đã XUẤT BẢN mới hiện

Bản thảo, tập đang render, tập chưa duyệt đều không lọt ra trang nghe. Xuất bản ở Studio: trang tập → Audio → **Xuất bản**.

Nút đó gọi `assertTransition`, chặn hai thứ: chưa duyệt bản thảo, và còn nhạc nền/hiệu ứng chưa xác minh giấy phép.

### Player có gì

| | |
|---|---|
| Mini-player cố định dưới đáy | Phát/dừng, tua ±15s, kéo thanh tiến độ |
| **Hẹn giờ tắt** | 10–60 phút — thứ quan trọng nhất với truyện nghe trước khi ngủ |
| Tốc độ | 0.75× → 2×, nhớ lựa chọn |
| **Nhớ vị trí nghe** | localStorage, lưu mỗi 5 giây. Quay lại hiện "Nghe tiếp" |
| Tự phát tập tiếp | Trừ khi đang hẹn giờ tắt |
| **Điều khiển từ màn hình khoá** | Media Session API — phát/dừng/tua từ tai nghe |
| Đọc lời truyện | Bung ra xem toàn văn |

Chưa có: đăng nhập, bình luận, đánh giá, nghe offline. Vị trí nghe lưu trên máy, chưa đồng bộ giữa thiết bị — chưa cần tài khoản.

## Chạy hàng loạt

Trang bộ truyện trong Studio có mục **Chạy hàng loạt**: đưa từng tập đi hết chuỗi

```
viết cảnh → [duyệt] → kịch bản audio → tóm tắt → đọc → ghép MP3
```

Chạy **tuần tự** từng tập, vì tập sau cần tóm tắt và sự kiện của tập trước. Tập nào đã xong bước nào thì bỏ qua bước đó — bật lại lượt chạy là tiếp tục từ chỗ đang dở.

Chạy trong worker chứ không trong trình duyệt, nên đóng tab không làm gián đoạn.

| Lựa chọn | |
|---|---|
| Chạy cả TTS và ghép MP3 | Bỏ chọn để dừng sau khi có kịch bản audio — đọc lại toàn bộ bản thảo trước rồi mới tốn thời gian đọc. |
| Tự duyệt bản thảo | Bỏ qua chốt chặn. **Chỉ dùng khi đang thử.** |

Không bật tự duyệt thì lượt chạy dừng ở tập đầu tiên chưa duyệt và chuyển sang trạng thái *chờ duyệt*. Duyệt tập đó trong Studio là nó tự đi tiếp — không phải bấm chạy lại.

**Điều phối bằng sự kiện, không bằng vòng lặp chờ.** Mỗi job xong thì worker xét trạng thái tập rồi đẩy bước kế tiếp. Một job ngồi chờ job khác sẽ chiếm chỗ trong làn suốt thời gian đó, mà làn LLM chỉ có một chỗ — hai tập cùng chờ nhau là treo cả hàng đợi. Studio không mang logic điều phối: nó chỉ đẩy job `BATCH`, worker mới biết chuỗi bước.

Bước kế tiếp xét theo **dữ liệu đã có** (`draftText` có chưa, bao nhiêu block, block nào đã có audio) chứ không theo `Episode.status` — status lệch được khi bấm tay giữa chừng.

Một job hỏng hẳn thì dừng cả lượt: tập sau thường cần tóm tắt của tập trước, chạy tiếp chỉ chồng thêm lỗi. Bấm dừng thì job đang chạy vẫn chạy nốt, chỉ là không bước nào được đẩy tiếp.

---

## Hiệu ứng âm thanh

Bước biên tập audio đã tự sinh gợi ý (`Block.sfxHint`) — ví dụ *"tiếng phanh gấp"*. Thêm file vào Thư viện nhạc với loại **hiệu ứng**, rồi gán cho từng block ở trang Audio của tập.

Hiệu ứng phát ở **đầu block**, và được chèn **trước** khi trộn nhạc nền — nên tiếng cửa đập cũng kéo nhạc xuống như một cảnh audio drama thật. Chèn sau thì nhạc dửng dưng với mọi thứ trừ giọng nói.

Mốc thời gian tính đúng bằng cách `concatBlocks` xếp: tổng độ dài các block trước cộng tổng khoảng lặng trước đó. Lệch một khoảng lặng là mọi hiệu ứng sau đó rơi sai chỗ, nên phần này có test riêng.

Hiệu ứng **không** kéo dài tập: tràn quá đuôi thì bị cắt.

---

## Nghe offline

Trang nghe có nút **Tải về nghe offline**. Service worker (`apps/player/public/sw.js`) giữ file trong cache riêng.

| | |
|---|---|
| Kho `shell` | Vỏ app. Xoá được thoải mái, tải lại là có. Chiến lược: ưu tiên mạng, mất mạng rơi về cache. |
| Kho `audio` | File người dùng **chủ động** tải. Không bao giờ tự dọn — người ta tải trước chuyến xe đêm, mất là mất chuyến đó. |

**Không tự cache khi phát.** Một tập 20 phút là ~25 MB; cache lén cả bộ là ăn hết dung lượng máy mà người dùng không biết.

Khoá cache bỏ mọi tham số trừ `key`/`path` — trình duyệt gửi kèm `Range` khi tua, lấy nguyên URL làm khoá thì lần tua thứ hai coi như chưa tải. Quy tắc này có **hai bản sao** (service worker không import được module của app) nên có test đọc `sw.js` để bắt lúc hai bên trôi khỏi nhau.

**Chưa làm trong Phase 8:** phân tích lượt nghe (chưa có người nghe nào) và tự động đăng TikTok (cần video 9:16 NVENC — nửa còn lại của Phase 6, cần GPU).

---

## Nghe bằng app podcast

Mỗi bộ có một feed RSS: `/truyen/<slug>/rss.xml`. Dán URL đó vào app podcast bất kỳ.

Chỉ tập **đã xuất bản và đã có bản MP3** vào feed — cùng chốt chặn với trang nghe.

**Cần đặt `PLAYER_PUBLIC_URL`** khi chạy thật. App podcast tải file từ bên ngoài nên URL trong feed phải tuyệt đối. Để trống thì suy từ header `Host` — đủ khi chạy tại chỗ. Không dùng `req.url` được vì Next trả về địa chỉ đang bind (`http://0.0.0.0:3001`), app podcast không tới được.

`/api/audio` có hỗ trợ `Range`, nên tua giữa tập không phải tải lại từ đầu.

Hai chỗ đã biết là chưa đủ chuẩn Apple Podcasts:

| | |
|---|---|
| Ảnh bìa | `Series.coverUrl` trống thì bỏ thẻ `itunes:image`. Apple bắt buộc có ảnh mới nhận feed; app khác vẫn đọc được. |
| Danh mục | Danh mục iTunes là danh sách tiếng Anh cố định, không map được từ `genre` tiếng Việt tự do. Đang để `Fiction` và đẩy genre thật xuống `itunes:keywords`. |

---

## Thử khung hàng đợi

```bash
pnpm job:mock                              # 3 job ở làn LLM
pnpm job:mock 1 --fail                     # thử đường lỗi + retry
pnpm job:mock 2 --lane=FFMPEG --vram=8000  # thử người gác VRAM
pnpm queue:status                          # xem kết quả
```

Lệnh thứ ba là phép thử quan trọng nhất: làn `FFMPEG` cho phép **2 job song song**, nhưng 2 × 8000MB vượt ngân sách 14336MB nên người gác VRAM ép chúng chạy lần lượt. Log worker sẽ hiện:

```
[vram] +8000MB cho FFMPEG:... → dùng 8000/14336MB
[vram] FFMPEG:... đợi VRAM — cần 8000MB nhưng chỉ còn 6336MB
```

Vì sao cần đến vậy: **tràn VRAM không ném lỗi**. Driver âm thầm đẩy phần thừa sang RAM hệ thống, mọi thứ vẫn "chạy" nhưng chậm đi khoảng 10 lần, không có gì để bắt trong `try/catch`. Nên phải tự đếm trước khi nạp model.

---

## Lỗi hiện ở đâu

Lỗi mà người dùng gặp trong lúc dùng bình thường — chưa duyệt bản thảo, track còn tập đang dùng, prompt sai biến — được trả về **dưới dạng giá trị** và hiện ngay tại form (`components/ActionForm`). Người dùng giữ nguyên thứ đang gõ dở.

Không ném lỗi cho những trường hợp đó: server action ném lỗi thì Next dựng trang lỗi và **giấu nội dung ở production**, người dùng chỉ thấy một mã digest. Ném lỗi vẫn đúng cho thứ không đáng xảy ra (id không tồn tại, mất kết nối DB) — đó là bug, không phải việc người dùng xử lý được; những cái đó rơi vào `app/error.tsx` và hiện mã tra log.

---

## Test

`pnpm test` — chạy bằng vitest, không cần Postgres hay Redis.

| Gói | Kiểm gì |
|---|---|
| `packages/core` | Máy trạng thái Episode và **hai chốt chặn**: bản thảo chưa duyệt không sang được bước audio, asset `UNKNOWN` giấy phép không xuất bản được. Cả slugify tiếng Việt (chữ `đ` mà `normalize("NFD")` không tách được). |
| `packages/audio` | Ducking, lặp/cắt nhạc nền, **mốc thời gian hiệu ứng**, loudnorm hai lượt. **Chạy ffmpeg thật** — cần `ffmpeg` trên máy. |
| `apps/worker` | `StorageDriver.resolve` đọc đúng cả ba dạng tham chiếu: khoá, `https://`, `file://` cũ. Và bước kế tiếp của chạy hàng loạt — kể cả việc KHÔNG được nhảy qua chốt duyệt. |
| `apps/studio` | **Mọi trang render được** với dữ liệu đúng dạng API (jsdom) — lưới an toàn cho lần chuyển từ Next sang Vite. Và dựng URL phát nhạc. |
| `apps/api` | Đọc header `Range`, đặt tên file an toàn. |
| `apps/player` | Dựng RSS podcast (escape XML, URL tuyệt đối, RFC 822), đọc header `Range`, khoá cache offline, và máy trạng thái tải-về-nghe-offline. |
| `packages/llm` | Thay biến trong prompt, đối chiếu biến prompt dùng với biến bước đó truyền, và luật chọn prompt (biến thể thể loại thắng bản mặc định). |
| `packages/tts` | Từ điển phát âm: **quy tắc dài áp trước quy tắc ngắn**, term hiểu theo nghĩa đen, regex gõ sai không làm hỏng job. Và chuẩn hoá văn bản cho engine. |
| `packages/database` | **Ranh giới quyền riêng tư**: cột nào được rời máy sang DB hosted, khoá ngoại nào phải xoá. |

**Vì sao test audio không giả lập ffmpeg:** thứ dễ sai ở đó là chuỗi filter, mà chuỗi filter chỉ sai lúc ffmpeg chạy. Giả lập rồi so chuỗi tham số chỉ khoá lại đúng cái vừa viết — filter hỏng vẫn xanh. Đổi lại, test này chậm hơn và cần ffmpeg.

CI (`.github/workflows/ci.yml`) chạy typecheck → test → build trên mỗi push và PR, có cài sẵn ffmpeg.

---

## Cấu trúc

```
apps/
  studio/    Next.js — chạy tại chỗ, cổng 3000. Không deploy.
  player/    Next.js — deploy Vercel, cổng 3001.
  worker/    Node — BullMQ, 4 làn: LLM / TTS_CPU / TTS_GPU / FFMPEG.
packages/
  config/    env (zod), ngân sách VRAM, hằng số
  database/  Prisma schema + client + publish-scope
  core/      schema domain, chia cảnh, máy trạng thái, chốt chặn
  llm/       provider (mock/Ollama), prompt, telemetry
  tts/       TTSProvider (mock/kokoro/piper), cache-key, từ điển phát âm
  audio/     ffmpeg: ghép block, loudnorm, xuất MP3
prompts/     5 prompt gốc, seed vào bảng Prompt
```

Luật import: `apps/player` **không được** import `llm` / `tts` / `audio` — tránh đóng gói client Ollama lên Vercel.

---

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `pnpm infra:up` / `infra:down` | Bật/tắt Postgres + Redis |
| `pnpm db:push` | Đồng bộ schema (lúc đang nghịch) |
| `pnpm db:migrate` | Tạo migration (khi schema đã ổn định) |
| `pnpm db:studio` | Xem dữ liệu bằng giao diện |
| `pnpm typecheck` | Kiểm tra kiểu toàn bộ workspace |
| `pnpm api` / `studio` / `player` | Chạy từng app |
| `pnpm test` | Chạy test (cần `ffmpeg` — xem mục dưới) |
| `pnpm queue:status` | Trạng thái hàng đợi + ngân sách VRAM |
| `pnpm story "<ý tưởng>"` | Chạy trọn chuỗi viết truyện |
| `pnpm inspect [seriesId]` | Xem chi tiết truyện đã sinh + telemetry |
| `pnpm db:seed` | Nạp prompt, giọng giả lập, từ điển phát âm |
| `pnpm fix:storage-refs` | Dọn tham chiếu `file://` cũ thành khoá (`--apply` để ghi thật) |
| `pnpm db:push:player` | Đẩy schema sang DB hosted + kiểm ranh giới quyền riêng tư |
| `pnpm story "<ý tưởng>" --episodes=N` | Chạy hàng loạt từ dòng lệnh (bản Studio ở trang bộ truyện) |
