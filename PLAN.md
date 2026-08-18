# Kế hoạch phần mềm Audio Truyện — Bản chạy local (máy để bàn, RTX 5060 Ti 16GB)

> Phần mềm gồm **2 trang chính**: một trang để *sản xuất* (Studio) và một trang để *người nghe* phát audio (Player).
> Quy trình: **LLM local viết truyện → chuyển thành kịch bản audio → TTS đọc → trộn nhạc → xuất bản**.
> Nội dung: **truyện ngắn** và **truyện dài** nhiều tập.
> Phạm vi hiện tại dừng ở **tạo ra file audio**. Đăng lên nền tảng nào là việc sau.
> **Toàn bộ khâu sản xuất chạy offline tại nhà, không gọi API trả phí.**

---

## 0. Phần cứng — đọc phần này trước

Máy sản xuất dự kiến: **PC với RTX 5060 Ti 16GB** ([448 GB/s, GDDR7 28Gbps, 128-bit, 180W TGP](https://www.tomshardware.com/pc-components/gpus/nvidia-geforce-rtx-5060-ti-16gb-review)).

Con số quan trọng nhất là **băng thông bộ nhớ 448 GB/s** — khâu sinh chữ của LLM bị giới hạn bởi băng thông chứ không phải sức tính toán, nên đây là chỉ số quyết định tốc độ.

### So sánh với phương án MacBook M1 trước đó

| | MacBook M1 16GB | RTX 5060 Ti 16GB |
|---|---|---|
| Băng thông bộ nhớ | 68 GB/s | **448 GB/s (6,6×)** |
| Tốc độ sinh chữ (model 14B Q4) | ~6–7 tok/s | **~35–45 tok/s** |
| Thời gian viết 1 tập (~2.500 từ) | 15–25 phút | **2,5–4 phút** |
| Viết 10 tập truyện dài | 4–6 tiếng (chạy đêm) | **~30–40 phút** |
| VRAM cho model | ~11–12GB (chia với hệ điều hành) | **~13–14GB** (16GB trừ ~1–2GB Windows desktop chiếm) |

**Ba hệ quả thiết kế — đây là lý do plan này khác hẳn bản M1:**

1. **Sản xuất trở lại gần như tương tác.** Không cần kiến trúc "đặt lệnh rồi chạy qua đêm" nữa. Vẫn dùng hàng đợi (để chạy hàng loạt và không khoá giao diện), nhưng bạn ngồi chờ vài phút là có bản thảo — sửa và render lại ngay trong một buổi làm việc.

2. **Chạy được model tốt hơn.** 16GB VRAM riêng (không chia với hệ điều hành như RAM hợp nhất của Mac) cho phép dùng model 14B ở mức lượng tử hoá cao hơn (Q6 thay vì Q4 — văn mượt hơn rõ), hoặc thử model 24B. Đây là điều quan trọng nhất, vì rủi ro lớn nhất của phương án local là **văn nhạt**.

3. **Voice cloning trở nên khả thi.** Trên M1, các engine clone giọng (viXTTS, F5-TTS) quá chậm nên đa giọng nhân vật phải đẩy sang giai đoạn cuối. Trên GPU, chúng chạy nhanh — **mỗi nhân vật một giọng riêng giờ là tính năng làm được sớm**, không còn là thứ xa xỉ. Xem mục 6.

**Cảnh báo kỹ thuật quan trọng — RTX 50 series là kiến trúc Blackwell (`sm_120`), cần CUDA 12.8+ và driver mới.** Rất nhiều dự án AI (đặc biệt các repo TTS) ghim sẵn phiên bản PyTorch cũ (`cu121`, `cu124`) — cài theo hướng dẫn mặc định sẽ báo lỗi kiểu *"no kernel image is available for execution on the device"*. Cách xử lý: luôn cài PyTorch bản `cu128` trở lên, và dùng bản llama.cpp/Ollama mới. **Hãy tính trước nửa ngày cho việc dựng môi trường** — đây là chỗ tốn thời gian nhất khi bắt đầu, không phải chỗ khó nhất về mặt kỹ thuật.

### Môi trường: Windows + WSL2 (Ubuntu)

Đây là môi trường đã chốt. Toàn bộ stack (Ollama, TTS, Postgres, Node) chạy trong WSL2; Windows chỉ giữ driver GPU và trình duyệt.

**Bốn nguyên tắc bắt buộc — sai một trong bốn là mất cả buổi để gỡ:**

| Nguyên tắc | Lý do |
|---|---|
| **Driver NVIDIA chỉ cài trên Windows, TUYỆT ĐỐI không cài driver Linux trong WSL2** | Cài driver trong WSL2 sẽ phá cơ chế passthrough. Driver Windows tự expose GPU vào WSL qua `/usr/lib/wsl/lib/`. Cần bản **570.xx trở lên** cho RTX 50 series. |
| **Trong WSL2 chỉ cài CUDA Toolkit, dùng repo `wsl-ubuntu`** | Repo Linux thông thường kèm theo driver hiển thị → hỏng passthrough. Và cài gói `cuda-toolkit-12-8`, **không phải** gói meta `cuda` (gói này kéo theo driver stub gây lỗi). |
| **PyTorch phải là bản `cu128`** | Bản `cu121`/`cu124` với Blackwell (`sm_120`) có thể **chạy mà cho kết quả sai âm thầm**, không báo lỗi — nguy hiểm hơn là crash. |
| **Mã nguồn và model để trong hệ thống file WSL (`~/`), không để ở `/mnt/c/`** | Truy cập chéo hệ điều hành chậm ~10 lần. Với `node_modules` và file audio lớn, khác biệt rất rõ. |

**Ba điều chỉnh cấu hình cần làm:**

1. **VRAM thực tế thấp hơn 16GB.** Windows desktop + trình duyệt (đặc biệt khi bật tăng tốc phần cứng) chiếm ~1–2GB VRAM. Ngân sách thực là **~13–14GB**, không phải 16GB. Khi chạy job nặng, đóng bớt tab trình duyệt.

   Tin tốt: **Kokoro chạy trên CPU nên không đụng vào ngân sách này** (xem mục 6.1) — gần như toàn bộ 13–14GB dành cho LLM. Qwen3 14B Q6 (~12GB) vừa thoải mái.

2. **RAM cho WSL2: đặt 24GB** (mặc định chỉ 50% RAM máy). Postgres + Redis + Node + Kokoro chạy chung trong đó, và phần dư còn dùng làm chỗ đệm để chạy model MoE lớn hơn VRAM (mục 5.1). Cấu hình trong `C:\Users\<tên>\.wslconfig` — nhớ thêm `autoMemoryReclaim=gradual` để WSL2 trả RAM lại cho Windows khi rảnh.

3. **Dung lượng ổ đĩa.** Mỗi model 10–15GB, thử 3–4 model là hết 50GB. Ổ chứa WSL (thường ổ C) cần dư ≥150GB, hoặc chuyển distro sang ổ khác.

**Điểm được lợi của WSL2:** Studio chạy ở `localhost:3000` trong WSL2 nhưng mở được trực tiếp bằng trình duyệt Windows — WSL2 tự chuyển tiếp cổng. Bạn code trong WSL2, làm việc trên Windows như bình thường.

📄 **Hướng dẫn cài đặt từng bước: [`docs/setup-wsl2.md`](docs/setup-wsl2.md)**

---

## 1. Mục tiêu

| Mục tiêu | Mô tả |
|---|---|
| Sản xuất khép kín, offline | Từ ý tưởng → file audio hoàn chỉnh, không phụ thuộc API bên ngoài, không tốn phí theo lượt. |
| Không giới hạn số lượng | Chạy bao nhiêu tập cũng chỉ tốn điện — thoải mái viết lại, thử nghiệm, bỏ đi. |
| Riêng tư | Ý tưởng và bản thảo không rời khỏi máy. |
| Ra file audio nghe được | MP3 chuẩn −16 LUFS. Xuất cho từng nền tảng (TikTok, YouTube…) để sau khi cần. |
| Nhất quán xuyên tập | Truyện dài giữ đúng tên nhân vật, tính cách, mạch truyện qua hàng chục tập. |
| Đa giọng nhân vật | Mỗi nhân vật một giọng riêng — khả thi nhờ GPU. |

### Ngoài phạm vi (giai đoạn đầu)
- Không làm app mobile native (web responsive + PWA).
- Không tự động đăng TikTok (Phase 7).
- Không huấn luyện/fine-tune model riêng.

---

## 2. Hai trang chính

### 2.1. Trang STUDIO — `/studio` (chạy trên PC sản xuất)

**Luồng làm việc (6 bước):**

```
[0] LLM viết truyện  →  [1] Duyệt & sửa bản thảo  →  [2] Chuyển thành kịch bản audio
                                                              ↓
       [5] Xuất bản  ←  [4] Trộn nhạc nền + intro/outro  ←  [3] TTS đọc thành audio
```

---

#### Bước 0 — LLM local viết truyện

Ba chế độ:

| Chế độ | Đầu vào của bạn | Máy làm gì |
|---|---|---|
| **Tự động** | 1 dòng ý tưởng + thể loại + độ dài | Sinh dàn ý → viết trọn truyện |
| **Bán tự động** | Bạn viết dàn ý, LLM viết lời | Bám sát dàn ý, viết từng chương |
| **Nhập sẵn** | Bạn dán truyện có sẵn | Bỏ qua bước 0 |

**Quy trình 4 giai đoạn.** Chia nhỏ vẫn cần thiết — không phải vì tốc độ nữa (GPU nhanh rồi) mà vì **chất lượng**: model 14B mất mạch sau ~1.500 token liên tục dù chạy trên phần cứng nào.

**0a. Sinh dàn ý** — ép model trả JSON theo schema cố định (dùng `format` của Ollama hoặc GBNF grammar; model nhỏ hay trả JSON hỏng nếu chỉ nhắc bằng lời):
```json
{
  "title": "Chuyến xe cuối cùng",
  "logline": "Một tài xế xe khách đêm nhận ra hành khách cuối cùng đã chết từ 3 năm trước.",
  "genre": "kinh dị",
  "characters": [
    { "name": "Tài", "role": "tài xế xe khách, 45 tuổi", "voice": "nam trung niên, giọng khàn" },
    { "name": "Cô gái áo trắng", "role": "hành khách bí ẩn", "voice": "nữ trẻ, giọng nhẹ" }
  ],
  "episodes": [
    { "no": 1, "title": "Chuyến 11 giờ đêm", "beats": ["...", "..."], "hook_cuoi": "..." }
  ]
}
```
→ Bạn sửa trên form rồi mới cho viết tiếp.

**0b. Viết theo cảnh (600–900 từ mỗi cảnh).** Mỗi lần gọi nạp:
- **Story Bible** (dàn ý + hồ sơ nhân vật + luật thế giới) — cố định
- **Tóm tắt các tập trước** (150–250 từ/tập)
- **Toàn văn cảnh liền trước** (nối mạch tự nhiên)
- Beat của cảnh hiện tại

Với GPU, mỗi cảnh mất **40–70 giây** — đủ nhanh để bạn đọc, không ưng thì sinh lại ngay với `temperature` khác.

**0c. Biên tập cho audio** — viết lại thành kịch bản **nghe được**:
- Bỏ mô tả thị giác thuần tuý ("dòng chữ in nghiêng bên góc trái")
- Câu ngắn lại, tránh câu lồng nhiều mệnh đề
- Thêm điểm ngắt nghỉ, gợi ý hiệu ứng âm thanh
- **Tách block + gán người nói** → JSON đúng schema bảng `Block` → nối thẳng vào bước 2

**0d. Tóm tắt tập vừa viết** (model 8B là đủ) → nạp làm ngữ cảnh cho tập sau.

**Giao diện:** stream chữ chạy dần, hiển thị tốc độ token/giây, có nút huỷ và nút "sinh lại cảnh này".

---

#### Bước 1 — Duyệt & sửa bản thảo
- Soạn thảo trực tiếp, đánh dấu đoạn cần viết lại (chỉ render lại cảnh đó).
- Đếm từ + ước lượng thời lượng audio (~150–170 từ/phút tiếng Việt).
- **Bắt buộc có người duyệt** trước khi sang bước đọc — cờ `humanReviewed` trong DB.

#### Bước 2 — Kịch bản & chọn giọng
- Nhận block đã tách từ bước 0c.
- Mỗi block: giọng đọc, tốc độ, khoảng lặng sau block (ms).
- **Casting nhân vật** — ánh xạ mô tả giọng → voicepack (Kokoro) hoặc mẫu giọng tham chiếu (engine clone). Lưu trong Story Bible để tất cả các tập dùng chung một dàn diễn viên.
- **Từ điển phát âm riêng** — quan trọng vì G2P tiếng Việt của các engine local dễ sai tên riêng, số và từ vay mượn.

#### Bước 3 — TTS đọc thành audio
- Gọi TTS theo từng block, cache theo `hash(text + voice + params)`.
- Sửa 1 block chỉ đọc lại đúng block đó.
- Nghe thử từng block, tick ✅ duyệt / ❌ đọc lại.

#### Bước 4 — Trộn (mixing)
- Timeline 3 track: `Giọng đọc` / `Nhạc nền` / `Hiệu ứng (SFX)`.
- Nhạc nền tự động **ducking** (hạ nhạc khi có tiếng nói).
- Intro / outro cố định của kênh.
- Chuẩn hoá loudness **−16 LUFS** — chuẩn podcast/web, mức chung an toàn.
  *(Mỗi nền tảng có mức riêng: YouTube −14, TikTok ~−14. Chỉ chỉnh khi thật sự đăng lên đó.)*

#### Bước 5 — Xuất bản
- **TikTok**: MP4 9:16, ảnh bìa + waveform động + phụ đề burn-in. **Encode bằng NVENC** (`h264_nvenc`) — nhanh hơn nhiều so với CPU.
- **Podcast/Web**: MP3 128–192 kbps + chapters.
- **Phát thanh**: WAV 48kHz/24-bit + kịch bản `.txt` + bảng timecode.
- Đẩy file lên storage → hiện ở Player.

---

### 2.2. Trang PLAYER — `/` (công khai)

**Bố cục:**
- **Trang chủ**: banner truyện mới, hàng ngang "Đang hot", "Truyện dài đang ra", "Truyện ngắn", lọc theo thể loại.
- **Trang truyện** `/truyen/[slug]`: ảnh bìa, mô tả, danh sách tập, nút Phát / Phát tiếp.
- **Trang nghe** `/nghe/[id]`: player lớn + văn bản chạy theo audio (karaoke-style).

**Mini-player cố định dưới đáy:**
- Play/Pause, tua ±15s, tốc độ 0.75× → 2×.
- **Hẹn giờ tắt (sleep timer)** — rất quan trọng với truyện nghe đêm.
- Tự động phát tập tiếp theo.
- **Nhớ vị trí đang nghe** (localStorage + đồng bộ tài khoản).
- Tải về nghe offline (PWA + Service Worker).
- Media Session API → điều khiển từ màn hình khoá điện thoại.

**Tương tác:** yêu thích, lưu nghe sau, bình luận, đánh giá sao (có kiểm duyệt), chia sẻ kèm timestamp.

**Minh bạch AI:** nhãn "Nội dung có sự hỗ trợ của AI" ở trang truyện — TikTok và nhiều nền tảng đã yêu cầu.

---

## 3. Kiến trúc — "PC sản xuất" và "web phục vụ"

```
╔═════════════ PC TẠI NHÀ — RTX 5060 Ti 16GB (sản xuất) ═════════════╗
║                                                                     ║
║   Studio (Next.js, localhost:3000)                                  ║
║        │                                                            ║
║   ┌────▼──────────────┐                                             ║
║   │  Job Queue        │  phân luồng theo tài nguyên:                ║
║   │  (BullMQ + Redis) │   • luồng LLM (GPU)  : concurrency 1        ║
║   └────┬──────────────┘   • luồng TTS (CPU)  : concurrency 3-4      ║
║        │                  • luồng clone (GPU): concurrency 1        ║
║        │                  • luồng ffmpeg     : concurrency 2        ║
║   ┌────▼──────────────────────────────────────────────┐             ║
║   │  Worker (Node)                                    │             ║
║   │                                                   │             ║
║   │   ── GPU (~13-14GB khả dụng) ──                   │             ║
║   │   • Ollama       → :11434  viết        ~9-12GB    │             ║
║   │   • viXTTS/F5    → :8881   clone giọng ~4GB (*)   │             ║
║   │   • faster-whisper         phụ đề      ~1GB       │             ║
║   │   • ffmpeg NVENC           encode video           │             ║
║   │                                                   │             ║
║   │   ── CPU (không đụng VRAM) ──                     │             ║
║   │   • Kokoro ONNX  → :8880   dẫn truyện   0 GB      │             ║
║   │   • ffmpeg       trộn / ducking / normalize       │             ║
║   └────┬──────────────────────────────────────────────┘             ║
║        │   (*) chỉ nạp khi cần; xem ràng buộc bên dưới              ║
║        │                                                            ║
║   ┌────▼──────────┐                                                 ║
║   │  Postgres     │  (Docker, local)                                ║
║   └───────────────┘                                                 ║
╚════════│════════════════════════════════════════════════════════════╝
         │  đẩy file audio + metadata khi xuất bản
         ▼
┌─────────────────────────────────────┐
│  Cloudflare R2 + Player (Vercel)    │  ← phần duy nhất cần online
└─────────────────────────────────────┘
```

**Năm điểm thiết kế:**

1. **Tách rõ việc nào chạy GPU, việc nào chạy CPU.** Đây là điều chỉnh quan trọng: **Kokoro chỉ 82M tham số, chạy ONNX Runtime trên CPU vẫn nhanh hơn thời gian thực nhiều lần** — không cần và không nên chiếm VRAM. Kết quả:

   | | GPU | CPU |
   |---|---|---|
   | Luôn chạy | LLM (Ollama) | Kokoro (dẫn truyện), ffmpeg trộn/normalize |
   | Chỉ khi cần | Engine clone giọng, whisper, NVENC | |

   Nhờ vậy hai luồng nặng nhất — viết truyện và đọc dẫn truyện — **không tranh nhau tài nguyên**, chạy song song thật sự.

2. **Ràng buộc VRAM duy nhất còn lại: LLM + engine clone giọng.** LLM 14B Q6 (~12GB) + clone giọng (~4GB) = **tràn 13–14GB khả dụng**. Hai cách xử lý, chọn theo giai đoạn:

   - **Trước Phase 5** (chưa làm đa giọng): dùng Q6 thoải mái, GPU chỉ có LLM.
   - **Từ Phase 5**: hoặc hạ LLM xuống Q4 (~9GB) để chạy song song với clone giọng, hoặc giữ Q6 và cho hai job này xếp tuần tự (`lane` riêng, không chạy đồng thời).

   Đặt hằng số ngân sách VRAM trong config, worker kiểm tra trước khi nhận job. **Tràn VRAM không báo lỗi rõ ràng** — driver âm thầm đẩy sang RAM hệ thống và chậm đi ~10 lần.

3. **Pipeline chồng lấn ba tầng.** GPU viết tập N+1 → CPU đọc tập N bằng Kokoro → ffmpeg render video tập N-1. Cả ba chạy cùng lúc mà không đụng nhau. Đây là lý do vẫn giữ hàng đợi dù tốc độ đã đủ để làm tương tác.

4. **Số nhân CPU giờ cũng quan trọng.** Kokoro và ffmpeg đều ăn CPU. Đặt `processors=` trong `.wslconfig` đủ cao (để lại 2 nhân cho Windows), và giới hạn luồng TTS khoảng **số nhân ÷ 2** để không làm nghẽn ffmpeg.

5. **Player deploy riêng, và cần DB riêng.** Người nghe không truy cập được PC ở nhà (IP động, tắt máy là mất) — Vercel cũng vậy, **nó không kết nối được vào Postgres nằm trong WSL2**. Nên có hai cơ sở dữ liệu:

   - **Postgres local** (Docker trong WSL2): đầy đủ — bản thảo, dàn ý, prompt, telemetry. Không bao giờ rời máy.
   - **Postgres hosted** (Neon/Supabase, gói miễn phí đủ dùng): chỉ chứa phần công khai — tập đã xuất bản, thông tin bộ truyện, bình luận, vị trí nghe.

   Job `PUBLISH` đồng bộ một chiều local → hosted khi bạn bấm xuất bản. Danh sách bảng/cột được phép ra ngoài khai báo tường minh ở `packages/database/src/publish-scope.ts` — đây là chốt chặn cho mục tiêu "riêng tư" ở mục 1.

   Nếu muốn tự host cả Player thì dùng Cloudflare Tunnel và bỏ DB hosted — nhưng khi đó phải để máy chạy 24/7.

📄 **Cấu trúc mã nguồn chi tiết: [`docs/project-structure.md`](docs/project-structure.md)**

---

## 4. Tech stack

| Lớp | Lựa chọn | Ghi chú |
|---|---|---|
| Tổ chức mã | **Monorepo pnpm + Turborepo** | 3 app (`studio`, `player`, `worker`) + 6 package dùng chung — xem [`docs/project-structure.md`](docs/project-structure.md) |
| Frontend + API | **Next.js 15 + TypeScript** | Studio và Player là hai app riêng nhưng dùng chung package lõi. |
| UI | Tailwind + shadcn/ui | |
| DB | Postgres + Prisma — **local (đầy đủ) + hosted (công khai)** | Xem mục 3 điểm 5 |
| Queue | BullMQ + Redis (Docker local) | Phân luồng theo ngân sách VRAM. |
| **LLM** | **Ollama** (mục 5) | Server OpenAI-compatible ở `localhost:11434`. |
| **TTS** | **Kokoro** (dẫn truyện) + engine clone giọng (nhân vật) — mục 6 | |
| Audio/Video | **ffmpeg có NVENC** | Trộn, ducking, normalize, waveform, encode video bằng GPU. |
| Phụ đề | **faster-whisper** (GPU) | Nhanh hơn nhiều so với whisper.cpp CPU; căn chữ cho phụ đề TikTok + karaoke. |
| Lưu trữ | Cloudflare R2 | Egress miễn phí — quan trọng khi stream audio. |
| Auth | Auth.js | Studio chạy local nên auth đơn giản; Player đăng nhập tuỳ chọn. |
| Deploy | Vercel (Player) + PC tại nhà (Studio + worker) | |

---

## 5. LLM local viết truyện

### 5.1. Chọn model — vừa 16GB VRAM

| Model | Lượng tử | VRAM | Tốc độ ước tính | Dùng cho |
|---|---|---|---|---|
| **Qwen3 14B** | **Q6_K** | ~12 GB | ~28–33 tok/s | **Lựa chọn chính** — chất lượng cao nhất còn dư VRAM cho ngữ cảnh |
| Qwen3 14B | Q4_K_M | ~9 GB | ~35–45 tok/s | Khi cần chạy song song với engine clone giọng |
| **Mistral Small 24B** | Q4_K_M | ~14 GB | ~22–28 tok/s | Đối chứng — dòng này viết văn sáng tạo tốt, đáng thử |
| Gemma 3 12B | Q6_K | ~10 GB | ~32–38 tok/s | Đối chứng văn phong khác Qwen |
| Qwen3 8B | Q6_K | ~7 GB | ~50–60 tok/s | Tóm tắt tập, tiêu đề/hashtag, tách block |

**Điểm khác biệt so với phương án M1:** ở Mac phải chấp nhận Q4 để vừa RAM; ở đây **Q6 vừa thoải mái**. Chênh lệch Q4 → Q6 nghe thì nhỏ nhưng với văn kể chuyện thì cảm nhận được — câu ít gượng, ít lặp cụm từ hơn.

**Đáng thử nghiêm túc — Qwen3-30B-A3B (MoE):** ~18,6GB ở Q4, vượt VRAM. Nhưng với **24GB RAM cấp cho WSL2**, việc đẩy bớt layer sang RAM hệ thống là hoàn toàn khả thi: ~13GB nằm trên GPU, ~6GB còn lại trong RAM.

Điểm mấu chốt khiến cách này đáng thử: **đây là model MoE, mỗi token chỉ kích hoạt 3B tham số** trong tổng 30B. Với model dày (dense) 30B, offload sang RAM sẽ chậm thảm hại vì mỗi token phải đọc toàn bộ trọng số; với MoE thì phần lớn trọng số nằm im, nên hình phạt nhẹ hơn nhiều — ước tính vẫn đạt **~15–25 tok/s**.

Đánh đổi: chậm hơn Qwen3 14B Q6 (28–33 tok/s), nhưng một tập vẫn chỉ mất 4–6 phút thay vì 2,5–4 phút. **Nếu chất lượng văn tiếng Việt vượt trội rõ thì rất đáng.** Đo thực tế ở Phase 0 rồi quyết — đây là ứng viên số một cho việc "nếu 14B viết chưa đủ hay thì làm gì".

Kiểm tra bản mới nhất trên `ollama.com/library` trước khi chốt — dòng model đổi nhanh.

### 5.2. Cài đặt

```bash
# Cài Ollama (Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Model
ollama pull qwen3:14b-q6_K
ollama pull qwen3:8b

# Giữ model trong VRAM giữa các lần gọi (nạp lại mất 10-20 giây)
export OLLAMA_KEEP_ALIVE=30m
```

Kiểm tra GPU nhận đúng: `nvidia-smi` phải thấy tiến trình `ollama` chiếm VRAM. Nếu không thấy, model đang chạy trên CPU — chậm gấp 10–20 lần và đây là lỗi im lặng hay gặp nhất khi mới dựng.

### 5.3. Gọi từ worker

```ts
const res = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  body: JSON.stringify({
    model: "qwen3:14b-q6_K",
    messages: [
      { role: "system", content: storyBible },
      { role: "user", content: `Viết cảnh ${n}. Beat: ${beat}\nCảnh trước:\n${prevScene}` },
    ],
    stream: true,
    format: outlineSchema,      // ép JSON đúng schema ở bước 0a và 0c
    options: {
      num_ctx: 16384,           // GPU dư VRAM → nạp được Story Bible dài hơn
      temperature: 0.9,         // văn sáng tạo: 0.85–1.0
      top_p: 0.92,
      repeat_penalty: 1.1,      // chống lặp cụm từ
      num_predict: 1500,        // giới hạn theo cảnh
    },
  }),
});
```

**Bốn lỗi hay gặp:**

| Lỗi | Hậu quả | Cách tránh |
|---|---|---|
| **Model chạy trên CPU mà không biết** | Chậm gấp 10–20 lần, không báo lỗi | Kiểm tra `nvidia-smi` ngay lần chạy đầu |
| Quên đặt `num_ctx` | Mặc định 2048 token → Story Bible bị cắt, model quên nhân vật | Đặt 16384 (VRAM dư) |
| Không đặt `repeat_penalty` | Model lặp cụm từ, lặp cả đoạn | 1.1–1.15 |
| Sinh cả tập một lần | Chất lượng tụt sau ~1.500 token | Sinh theo cảnh 600–900 từ |

**Lợi thế so với API cloud:** bạn có toàn quyền chỉnh `temperature` / `top_p` / `repeat_penalty`. Nâng temperature cho cảnh cao trào, hạ xuống cho cảnh cần logic chặt — cách rẻ nhất để các tập không giống nhau.

### 5.4. Prompt cần chuẩn bị (lưu trong DB, sửa được từ Studio)

| Prompt | Model | Nhiệm vụ |
|---|---|---|
| `outline.md` | Qwen3 14B | Sinh dàn ý + hồ sơ nhân vật từ 1 dòng ý tưởng |
| `write_scene.md` | Qwen3 14B | Viết một cảnh, bám Story Bible + cảnh trước |
| `audio_edit.md` | Qwen3 14B | Biên tập thành kịch bản đọc được, tách block + gán người nói |
| `summarize.md` | Qwen3 8B | Tóm tắt tập thành 150–250 từ |
| `metadata.md` | Qwen3 8B | Tiêu đề, mô tả, hashtag, gợi ý ảnh bìa |

Mỗi thể loại (kinh dị / tình cảm / trinh thám) có biến thể `write_scene` riêng. **Prompt cho model local cần cụ thể hơn model cloud** — nêu rõ số từ, ngôi kể, thì, cách mở đầu.

---

## 6. TTS tiếng Việt — chiến lược hai tầng

GPU thay đổi bài toán ở đây. Trên M1, chỉ Kokoro chạy nổi nên phải chấp nhận một giọng duy nhất. Trên 5060 Ti, **chạy được cả engine clone giọng** → làm được đa nhân vật ngay từ đầu.

### 6.1. Chiến lược hai tầng — tách GPU và CPU

| Tầng | Engine | Chạy ở | VRAM | Dùng cho |
|---|---|---|---|---|
| **Tầng 1 — nhanh** | **Kokoro tiếng Việt** (82M, ONNX) | **CPU** | **0 GB** | Người dẫn truyện (70–80% thời lượng) |
| **Tầng 2 — biểu cảm** | viXTTS / F5-TTS Vietnamese | GPU | ~4 GB | Hội thoại nhân vật (clone giọng riêng) |

**Kokoro chạy CPU là lựa chọn có chủ đích, không phải hạ cấp.** Model chỉ 82M tham số — bản ONNX lượng tử hoá chưa tới 100MB — nên CPU vẫn xử lý nhanh hơn thời gian thực nhiều lần. Đặt nó lên GPU chỉ để nhanh thêm chút ít nhưng lại **tranh VRAM với LLM**, thứ đang cần từng GB. Để CPU lo tầng 1, GPU chuyên tâm viết truyện.

Phần lớn thời lượng đi qua tầng 1 (miễn phí về VRAM), chỉ hội thoại mới cần tầng 2. Vì đã cache theo block, chi phí tính toán của tầng 2 rất có giới hạn.

Lợi ích kéo theo: **tầng 1 chạy song song thật sự với LLM** — trong khi GPU viết tập sau, CPU đọc tập trước. Không phải xếp hàng chờ nhau.

### 6.2. Kokoro tiếng Việt — tình trạng thực tế

**Kokoro bản chính thức (`hexgrad/Kokoro-82M`) chưa hỗ trợ tiếng Việt.** Ngôn ngữ chính thức gồm Anh, Nhật, Trung, Tây Ban Nha, Pháp, Hindi, Ý, Bồ Đào Nha — tiếng Việt đang trong diện được yêu cầu ([issue #153](https://github.com/hexgrad/kokoro/issues/153)).

Nhưng **cộng đồng đã có bản fine-tune tiếng Việt**:

| Nguồn | Nội dung |
|---|---|
| [`anphunl/Kokoro-Vietnamese`](https://huggingface.co/anphunl/Kokoro-Vietnamese) | Checkpoint PyTorch + voicepack tiếng Việt |
| [`contextboxai/Kokoro-Vietnamese`](https://huggingface.co/contextboxai/Kokoro-Vietnamese) | Kèm bản xuất ONNX cho acoustic model |
| `vig2p` | Bộ chuyển chữ→âm vị (G2P) tiếng Việt mà các bản trên dùng |

Chất lượng bản cộng đồng chưa được kiểm chứng rộng và số voicepack nhiều khả năng rất ít. Nhưng vì đã có tầng 2 lo phần đa giọng, **Kokoro chỉ cần làm tốt một việc: đọc phần dẫn truyện nghe được và ổn định.**

### 6.3. ⚠️ Giấy phép — kiểm tra trước khi đưa vào sản phẩm

Đây là rủi ro pháp lý thật, không phải chi tiết nhỏ:

- **XTTS-v2 (và viXTTS dẫn xuất từ nó) dùng Coqui Public Model License — cấm sử dụng thương mại.** Nếu bạn định bật kiếm tiền trên bất kỳ nền tảng nào, dùng engine này là vi phạm.
- **F5-TTS**: mã nguồn giấy phép mở, nhưng checkpoint gốc huấn luyện trên bộ dữ liệu Emilia (CC-BY-NC — phi thương mại). Các bản fine-tune tiếng Việt thừa hưởng ràng buộc này.
- **Kokoro**: Apache 2.0 — thoải mái cho mục đích thương mại. Các bản fine-tune cộng đồng cần kiểm tra riêng.
- **Piper**: MIT — thoải mái thương mại, có sẵn giọng `vi_VN`.

**Kết luận thực dụng:** nếu có ý định thương mại, **hãy xác minh giấy phép của từng model ở Phase 0**, trước khi xây pipeline quanh nó. Trường hợp xấu nhất mà vẫn an toàn: Kokoro (dẫn truyện) + Piper `vi_VN` (nhân vật, đổi giọng bằng cách chọn voice khác nhau) — chất lượng thấp hơn nhưng sạch về pháp lý.

### 6.4. Interface để đổi engine không phải sửa nghiệp vụ

```ts
interface TTSProvider {
  name: string
  tier: "fast" | "expressive"
  listVoices(): Promise<Voice[]>
  synthesize(input: {
    text: string
    voiceId: string
    refAudio?: Buffer   // cho engine clone giọng
    speed?: number
  }): Promise<{ audio: Buffer; durationMs: number }>
}
```

Router chọn engine theo `block.speaker`: `narrator` → tầng 1, còn lại → tầng 2.

---

## 7. Mô hình dữ liệu

📄 **Schema đầy đủ: [`docs/database.md`](docs/database.md)** — copy vào `prisma/schema.prisma` là chạy được.

Tóm tắt các nhóm bảng:

| Nhóm | Bảng | Vai trò |
|---|---|---|
| **Nội dung** | `Series` → `Episode` → `Scene` → `Block` | Bộ truyện → tập → cảnh (đơn vị LLM sinh) → block (đơn vị TTS đọc) |
| **Nhân vật & giọng** | `Character`, `Voice`, `PronunciationEntry` | Casting nhân vật ↔ giọng, từ điển phát âm |
| **Audio** | `AudioAsset`, `AudioTrack` | Cache audio dùng chung mọi tập; thư viện nhạc nền/SFX kèm giấy phép |
| **Xuất bản** | `Export` | Mỗi định dạng đầu ra một bản ghi (đỡ được TikTok cắt nhiều phần) |
| **AI & hàng đợi** | `Prompt`, `LlmRun`, `RenderJob` | Prompt có version, telemetry mỗi lần gọi LLM, hàng đợi phân làn theo tài nguyên |
| **Người nghe** | `User`, `ListenProgress`, `Favorite`, `Comment`, `Rating` | Phía Player |

Bốn điểm đáng lưu ý (giải thích đầy đủ ở mục 2 của `docs/database.md`):

1. **Truyện ngắn cũng thuộc một `Series`** — để nhân vật, casting, từ điển phát âm có một chỗ duy nhất, và để truyện ngắn ăn khách viết tiếp thành truyện dài mà không phải di chuyển dữ liệu.
2. **`AudioAsset` tách khỏi `Block`** — cùng một câu ở hai tập chỉ render một lần. Intro/outro cố định dùng lại cho cả bộ.
3. **`Block` lưu bản chụp engine/voice, không dùng khoá ngoại** — để đổi casting là `cacheKey` đổi theo, hệ thống tự biết cần render lại.
4. **`RenderJob.lane` phân theo tài nguyên** (`LLM` / `TTS_CPU` / `TTS_GPU` / `FFMPEG`), khớp với phần phân luồng ở mục 3.

## 8. Pipeline render

**8.1. Sinh văn bản** — luồng LLM `concurrency: 1`, `OLLAMA_KEEP_ALIVE=30m`, stream về Studio.

**8.2. TTS theo block**
- Hash `sha256(text + engine + voiceId + speed)` làm cache key.
- Router: `narrator` → Kokoro (CPU); nhân vật → engine clone giọng (GPU).
- **Kokoro (CPU)**: chạy song song ~số nhân CPU ÷ 2, không đụng VRAM nên không cần phối hợp với luồng LLM.
- **Clone giọng (GPU)**: giới hạn 1 job, và kiểm tra ngân sách VRAM trước khi nhận — nếu LLM đang giữ Q6 (~12GB) thì phải xếp tuần tự.

**8.3. Ghép giọng đọc** — nối block theo thứ tự, chèn khoảng lặng `pauseAfter` bằng `ffmpeg concat`.

**8.4. Trộn nhạc nền + ducking**
```bash
ffmpeg -i voice.wav -i bgm.mp3 \
  -filter_complex "[1:a]volume=0.18[bg]; \
                   [bg][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[duck]; \
                   [duck][0:a]amix=inputs=2:duration=first[out]" \
  -map "[out]" mixed.wav
```

**8.5. Chuẩn hoá loudness**
```bash
ffmpeg -i mixed.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 final_web.wav
```

**8.6. Video TikTok 9:16 (encode bằng GPU)**
```bash
ffmpeg -i cover.jpg -i final_web.wav \
  -filter_complex "[1:a]showwaves=s=1080x300:mode=cline[wave];[0:v][wave]overlay=0:1400[v]" \
  -map "[v]" -map 1:a \
  -c:v h264_nvenc -preset p5 -b:v 6M -s 1080x1920 \
  -c:a aac -b:a 192k out.mp4
```
Phụ đề burn-in lấy từ faster-whisper. Cắt "Phần 1/3" nếu dài quá 60s.

**8.7. Xuất cho nền tảng** — hoãn. Khi cần: TikTok/YouTube đều yêu cầu VIDEO (không nhận MP3), mỗi bên một tỉ lệ khung hình và mức LUFS riêng.

---

## 9. Lộ trình triển khai

| Phase | Nội dung | Kết quả đo được |
|---|---|---|
| **0 — Dựng môi trường & thử nghiệm** (2–3 ngày) | Cài driver + CUDA 12.8+, Ollama, Kokoro VN, một engine clone giọng. Thử viết 1 cảnh, thử đọc 1 đoạn 500 từ. **Kiểm tra giấy phép từng engine.** Không viết code hệ thống. | Trả lời được: văn có đọc được không? giọng có nghe được không? tốc độ thực tế bao nhiêu? engine nào dùng thương mại được? |
| **1 — Setup** (2–3 ngày) | Next.js, Prisma, Postgres + Redis (Docker), BullMQ phân luồng, R2. | Hàng đợi chạy được 1 job giả lập, có ngân sách VRAM. |
| **2 — LLM viết truyện** (1 tuần) | Prompt dàn ý + viết cảnh + biên tập audio, Story Bible, streaming, bảng `LlmRun`. | Nhập 1 dòng ý tưởng → ra bản thảo truyện ngắn đọc được trong ~5 phút. |
| **3 — Studio lõi** (1–2 tuần) | Chia block → TTS tầng 1 → ghép → xuất MP3. | Ra file MP3 truyện ngắn hoàn chỉnh, hoàn toàn offline. |
| **4 — Player** (1 tuần) | Trang chủ, trang truyện, player + nhớ vị trí + sleep timer. | Nghe được trên điện thoại, tắt màn hình vẫn chạy. |
| **5 — Đa giọng nhân vật** (1 tuần) | TTS tầng 2, casting trong Story Bible, router theo `speaker`. | Một tập có ≥3 giọng phân biệt rõ. |
| **6 — Mixing & TikTok** (1–2 tuần) | Nhạc nền + ducking + normalize + video 9:16 NVENC + phụ đề. **Phần audio đã xong** (README đánh số phần này là Phase 5): thư viện track ở `/tracks`, ducking bằng `sidechaincompress`, loudnorm hai lượt. Còn lại là phần video. | Xuất MP4 đăng thẳng lên TikTok. |
| **7 — Truyện dài & series** (1 tuần) | Quản lý bộ/tập, tóm tắt tự động, chạy hàng loạt, RSS podcast. | Đặt lệnh 10 tập → ~40 phút có bản thảo giữ đúng nhân vật. |
| **8 — Nâng cao** | Thư viện SFX, phân tích lượt nghe, PWA offline, tự động đăng TikTok. | |

> **Đa giọng nhân vật lên Phase 5** (bản M1 để tận cuối) — vì GPU làm được sớm, và đây là thứ tạo khác biệt rõ nhất so với các kênh truyện audio một giọng đang có trên thị trường.

---

## 10. Chi phí

**Chi phí vận hành hàng tháng:**

| Khoản | Chi phí |
|---|---|
| LLM, TTS, whisper, ffmpeg | **$0** |
| Postgres + Redis (Docker local) | **$0** |
| Điện (180W GPU, ~2h/ngày) | ~15.000–25.000đ/tháng |
| R2 storage + CDN | $1 – $5 (egress miễn phí) |
| Vercel (Player) | $0 – $20 |
| **Tổng** | **~$2 – $27/tháng** |

**Chi phí đầu tư một lần** *(nếu chưa có máy)*: RTX 5060 Ti 16GB khoảng 11–13 triệu; nguyên dàn PC hoàn chỉnh khoảng 25–35 triệu tuỳ cấu hình còn lại. Với 16GB VRAM và 180W, đây là điểm rơi hợp lý cho khối lượng công việc này — card mạnh hơn chủ yếu cải thiện tốc độ chứ không mở thêm được lớp model nào đáng kể ở tầm 16GB.

**Thời gian sản xuất thực tế:**

| Khối lượng | Thời gian |
|---|---|
| 1 cảnh (~800 từ) | 40–70 giây |
| 1 tập (~2.500 từ, 3–4 cảnh) | 2,5–4 phút |
| 1 tập → audio hoàn chỉnh | +3–5 phút (TTS + ffmpeg) |
| 10 tập truyện dài | **~30–40 phút** |

Nghĩa là: **một buổi tối đủ để sản xuất trọn một bộ truyện dài 10 tập**, kể cả thời gian đọc duyệt. Đây là khác biệt căn bản so với phương án M1.

---

## 11. Rủi ro & cách xử lý

| Rủi ro | Mức độ | Xử lý |
|---|---|---|
| **Môi trường CUDA/Blackwell không chạy** | Cao lúc đầu, một lần rồi thôi | RTX 50 series cần CUDA 12.8+, PyTorch `cu128`. Nhiều repo TTS ghim bản cũ → phải sửa. Dành nửa ngày cho việc này ở Phase 0. |
| **Model chạy trên CPU mà không biết** | Cao — lỗi im lặng | Kiểm tra `nvidia-smi` ngay lần chạy đầu; thêm cảnh báo trong Studio nếu tok/s thấp bất thường. |
| **Giấy phép engine clone giọng** | Cao — hậu quả pháp lý | XTTS-v2/viXTTS cấm dùng thương mại; F5-TTS vướng dữ liệu CC-BY-NC. **Xác minh ở Phase 0.** Phương án sạch: Kokoro + Piper. |
| **Kokoro tiếng Việt chất lượng không đạt** | Trung bình | Bản cộng đồng chưa kiểm chứng. Thử ở Phase 0; dự phòng Piper `vi_VN`. Vì đã có TTS tầng 2, Kokoro chỉ cần làm tốt phần dẫn truyện. |
| **Tràn VRAM khi chạy chồng lấn** | Thấp hơn trước (Kokoro đã chuyển sang CPU) | Chỉ còn rủi ro khi LLM Q6 + clone giọng chạy cùng lúc. Ngân sách VRAM trong config, worker kiểm tra trước khi nhận job. Tràn VRAM không báo lỗi rõ — chỉ chậm đi ~10 lần. |
| **CPU nghẽn vì Kokoro + ffmpeg tranh nhau** | Trung bình (mới, do chuyển Kokoro sang CPU) | Giới hạn luồng TTS ≈ số nhân ÷ 2; đặt `processors=` trong `.wslconfig` để lại 2 nhân cho Windows. |
| **Model 14B viết tiếng Việt nhạt/lặp** | Trung bình | Dùng Q6 thay Q4, chia nhỏ theo cảnh, `repeat_penalty` 1.1–1.15, prompt cụ thể. Nếu vẫn không đạt: thử Mistral Small 24B hoặc Qwen3-30B-A3B. |
| **Mất nhất quán ở truyện dài** | Trung bình | Story Bible cố định + tóm tắt tập trước. `num_ctx` 16384 cho phép nạp nhiều ngữ cảnh hơn bản M1. |
| **Bản quyền nhạc nền** | Trung bình | Chỉ dùng nhạc royalty-free (Pixabay, Uppbeat). TikTok quét bản quyền rất chặt. |
| **Bản quyền & đạo văn nội dung** | Thấp | LLM viết truyện gốc, không mô phỏng tác phẩm cụ thể. Ghi nhãn có hỗ trợ AI. |
| **Máy hỏng, mất hết** | Thấp nhưng nghiêm trọng | Toàn bộ dữ liệu trên 1 máy. Backup Postgres tự động hàng ngày lên R2. |

---

## 12. Việc cần làm ngay (Phase 0)

1. **Dựng môi trường WSL2 + CUDA** — theo [`docs/setup-wsl2.md`](docs/setup-wsl2.md). Kết thúc phải xác nhận được: `nvidia-smi` chạy trong WSL2, `torch.cuda.is_available()` trả `True`, và `torch.cuda.get_device_capability()` trả `(12, 0)` — đúng Blackwell `sm_120`. *(Tốn thời gian nhất, làm trước.)*
2. **Thử Kokoro tiếng Việt** — tải `anphunl` và `contextboxai`, đọc cùng 1 đoạn 500 từ có tên riêng + số + hội thoại, nghe so sánh.
3. **Thử một engine clone giọng** (viXTTS hoặc F5-TTS Vietnamese) — clone thử 2 giọng nhân vật, đo tốc độ và VRAM.
4. **Kiểm tra giấy phép** từng engine định dùng, đối chiếu với ý định thương mại của bạn. Việc này 30 phút nhưng tránh được rắc rối lớn về sau.
5. **Thử Qwen3 14B Q6** viết 1 cảnh 800 từ tiếng Việt; đo tok/s thực tế. Thử thêm Mistral Small 24B để so văn phong. **Nếu chưa ưng chất lượng, thử Qwen3-30B-A3B offload sang RAM** — 24GB RAM cho phép, và đây là bước nhảy chất lượng lớn nhất còn lại.
6. **Quyết định độ dài tập** — đề xuất 15–20 phút (~2.500–3.500 từ), chia 3–4 cảnh.
7. **Tên miền + tên thương hiệu** cho trang Player.

---

**Nguồn tham khảo:**
- [NVIDIA GeForce RTX 5060 Ti 16GB review — Tom's Hardware](https://www.tomshardware.com/pc-components/gpus/nvidia-geforce-rtx-5060-ti-16gb-review)
- [Request for Vietnamese Language Support in Kokoro TTS · Issue #153](https://github.com/hexgrad/kokoro/issues/153)
- [anphunl/Kokoro-Vietnamese · Hugging Face](https://huggingface.co/anphunl/Kokoro-Vietnamese)
- [contextboxai/Kokoro-Vietnamese · Hugging Face](https://huggingface.co/contextboxai/Kokoro-Vietnamese)
