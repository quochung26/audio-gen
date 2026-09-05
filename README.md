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
| — | Đa giọng nhân vật | ✅ định tuyến giọng · clone giọng (tầng 2) cần GPU |
| 5 | Nhạc nền + ducking | ✅ |
| 6 | Truyện dài: chạy hàng loạt, RSS podcast | ✅ |
| 8 | Nâng cao: hiệu ứng âm thanh, nghe offline, ảnh bìa, tài khoản + tương tác | ✅ một phần — xem dưới |
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

### Danh mục thể loại

`/the-loai` trong Studio (Cài đặt → Thể loại): thêm thể loại với **tên** và **mô tả**.

Mô tả không phải ghi chú cho người đọc — nó được nhét vào Story Bible, ngay sau dòng thể loại, dưới mục *"Thể loại này nghĩa là gì"*. Nhờ vậy `kinh dị` mang nghĩa **bạn** định chứ không phải nghĩa model tự đoán, mà mỗi model đoán một kiểu. Sửa mô tả là đổi cách viết của mọi bộ dùng thể loại đó, từ lượt viết kế tiếp.

Viết mô tả **bằng tiếng Anh**, như đang dặn người viết thuê — nói rõ cái gì nên và cái gì tránh:

> **kinh dị**: Fear comes from what cannot be explained, not from gore. Keep the pace slow: lay down ordinary, everyday detail first, then let one detail go wrong. No jump scares.

Tiếng Anh vì mô tả là **chỉ dẫn**, không phải nội dung: nó nằm giữa khối prompt tiếng Anh (xem mục [Ngôn ngữ](#ngôn-ngữ)), và model 7–14B tuân thủ chỉ dẫn tiếng Anh chặt hơn hẳn. Nó không kéo văn sang tiếng Anh — ngôn ngữ đầu ra do chỉ thị đầu system prompt quyết.

**TÊN** thể loại thì gõ tiếng gì cũng được và nên giữ nguyên: đó là khoá tra cứu (`Series.genre`) và là khoá chọn biến thể prompt, nên đổi tên là các bộ đang dùng tên cũ lặng lẽ mất phần mô tả trong Bible.

Thể loại **chính đứng đầu** danh sách mô tả, vì model đọc tuần tự — truy vấn DB trả về thứ tự tuỳ ý nên phải sắp lại.

Vài chỗ chặn:

- **Không xoá được thể loại đang có bộ dùng** (tính cả làm thể loại phụ). Xoá thì các bộ đó mất mô tả trong Bible mà không có gì báo — văn đổi đi ở lượt viết sau và rất khó lần ra nguyên nhân. Thay bằng **ẩn**: ô chọn không hiện nữa, bộ cũ vẫn giữ được mô tả.
- **Đổi tên không kéo theo bộ đang dùng tên cũ** — `Series.genre` lưu chuỗi, không phải khoá ngoại. Trang báo còn bao nhiêu bộ ghi tên cũ chứ không tự sửa hàng loạt.
- **Mô tả rỗng bị từ chối**: thể loại vốn đã dùng được mà không cần có trong danh mục, nên một bản ghi không mô tả thì chẳng làm gì cả.
- Mô tả tối đa 600 ký tự — nó nằm trong **mọi** lần gọi model.

Trang cũng nêu thể loại đang có truyện dùng nhưng **chưa có trong danh mục** (gõ tay ở ô thể loại phụ, hoặc dữ liệu cũ): model không được dặn gì về chúng.

`Genre` là bảng chỉ-ở-máy, không đồng bộ sang Player.

### Thẻ nhân vật

`/the-nhan-vat` — nhân vật dùng lại được giữa các bộ: tên, vai, tính cách và cách nói, gợi ý chất giọng, giọng ưa dùng.

**Thẻ không phải liên kết sống.** Mang thẻ vào một bộ là **chép nội dung** nó; từ đó nhân vật sống đời sống riêng trong bộ. Sửa thẻ không đụng tới bộ đã dùng, và sửa nhân vật trong bộ không đụng ngược lên thẻ. Đây là chỗ người ta mặc định hiểu ngược lại, nên nói thẳng: một bộ đang viết dở mà tự đổi theo thư viện là kiểu hỏng không ai thấy — văn ở tập sau đổi đi, và chẳng có gì trong bộ đó ghi lại là vì sao. `Character.cardId` chỉ ghi **xuất xứ**.

Ba lối vào:

| Ở đâu | Làm gì |
|---|---|
| Màn tạo truyện, mục *Dàn nhân vật trước* | Bấm thẻ để thêm, sửa lại ngay tại chỗ cho hợp bộ này, hoặc gõ hẳn một nhân vật riêng. Bỏ trống thì AI tự nghĩ như cũ. |
| Trang Nhân vật của một bộ | *Thêm từ thư viện thẻ* — chép một thẻ vào bộ đang viết. |
| Trang Nhân vật, từng nhân vật | *lưu vào thư viện* / *cập nhật thẻ* — đưa bản đã sửa ngược lên thư viện. *tách thành thẻ mới* giữ nguyên thẻ gốc. |

Chọn dàn trước thì prompt dàn ý nhận thêm khối `{{cast}}` (`renderCastForOutline`), song song với `{{world}}`: AI **phải** dùng đúng những người đó, đúng tên, và được thêm người mới nếu truyện cần. Người viết gõ gì thì thắng cái đó; ô nào để trống mới lấy phần model gợi ý — chọn một thẻ mới có mỗi cái tên vẫn ra nhân vật dùng được.

Đúng **một** người dẫn truyện, luôn luôn: người viết chỉ định thì model không được đổi, không ai được đánh dấu thì người đầu tiên nhận vai. Bộ không có người dẫn thì bước biên tập audio không tra ra ai cho các block dẫn truyện, và cả tập rơi về giọng mặc định mà không báo gì.

Xoá thẻ **không** bị chặn dù có bộ đang dùng — `Character` đã mang bản sao đầy đủ. Khác `Genre`: xoá thể loại là các bộ mất phần mô tả trong Bible, nên chỗ đó phải chặn.

### Thể loại chính và thể loại phụ

Một truyện có nhiều thể loại, chỉ khác nhau cái nào chính cái nào phụ. Hệ thống chia làm hai vì chúng làm hai việc khác nhau:

| | Lưu ở | Làm gì |
|---|---|---|
| **Thể loại chính** | `Series.genre` | Là **khoá** chọn biến thể prompt — `pickPrompt` tra theo nó, không khớp thì rơi về bản `*`. Vì là khoá nên phải đúng MỘT giá trị. |
| **Thể loại phụ** | `Series.tags` | Nhiều giá trị, gõ tự do. Không đổi prompt, mà vào thẳng **Story Bible** để lái giọng văn, và vào từ khoá RSS. |

Gộp lại thì hỏng một trong hai: bỏ chính đi thì việc chọn prompt phải dựa vào "tag đầu tiên" — mà thứ tự tag là thứ người ta kéo thả lung tung; bỏ phụ đi thì mọi định hướng nhỏ (`slow burn`, `đô thị`) đều phải đẻ ra một biến thể prompt riêng.

Dòng thể loại phụ nằm **ngay dưới** thể loại chính trong Bible, và nói rõ là thứ phải bám theo chứ không phải nhãn phân loại — liệt kê trần thì model coi là metadata rồi bỏ qua, văn ra y hệt như không đặt gì.

Sửa thể loại phụ ăn ngay ở lượt viết tiếp theo, vì Bible được **dựng lại từ dữ liệu mới nhất** mỗi lần viết cảnh chứ không dùng bản render sẵn. Tập đã viết xong thì giữ nguyên — chúng đã viết bằng định hướng cũ.

Việc dựng Bible từ bản ghi Series gom vào một hàm `seriesBible`. Trước đó có hai nơi tự viết tay danh sách tham số — worker lúc viết cảnh và API lúc sửa thiết lập thế giới — nên thêm một trường vào Bible mà quên một chỗ thì Bible vẫn dựng được, chỉ là thiếu mất một phần định hướng, và không có gì báo.

### Viết từng tập một

Tạo truyện chỉ dựng **một tập**: dàn ý, nhân vật, và tập 1. Tập sau thêm dần bằng nút **Viết tập mới** ở trang bộ truyện.

Không dựng sẵn mười tập từ một dòng ý tưởng, vì tập 8 lúc đó chỉ là phỏng đoán của model về một câu chuyện chưa được viết — mà bản thảo thật gần như luôn đi chệch dàn ý. Dựng từng tập thì mỗi tập được lên khi đã biết tập trước kết thúc ra sao, ai còn sống, tình tiết nào còn bỏ ngỏ.

Bước `NEXT_EPISODE` tách riêng khỏi `OUTLINE` vì hai việc khác hẳn: `OUTLINE` dựng cả bộ từ một dòng ý tưởng, còn `NEXT_EPISODE` viết tiếp một bộ đang chạy — nạp Story Bible, mạch truyện đã nén, tóm tắt tập liền trước và **tình tiết còn bỏ ngỏ**, rồi bắt tập mới đẩy tiếp hoặc giải quyết ít nhất một trong số đó.

Hai chỗ chặn:

- **Số tập do server chốt**, không để model tự đánh — model hay đánh lại từ 1 hoặc nhảy số, mà `(seriesId, number)` là ràng buộc duy nhất nên trùng số là job chết.
- **Tập gần nhất chưa có tóm tắt thì không cho viết tiếp.** Không có tóm tắt nghĩa là tập mới sẽ được dựng mà không biết tập trước kết thúc ra sao — đúng thứ mà viết-từng-tập sinh ra để tránh.

Ngữ cảnh cho bước này KHÔNG truy hồi sự kiện theo ngữ nghĩa như lúc viết cảnh: chưa biết tập sắp viết nói về cái gì thì lấy gì mà truy hồi. Đổi lại, tình tiết bỏ ngỏ được nạp đầy đủ.

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

### Giọng theo nhân vật

Casting riêng từng nhân vật **có tác dụng ngay**. `resolveVoice` chọn theo thứ tự: giọng của nhân vật → giọng mặc định của bộ → giọng đầu tiên khớp engine đang cấu hình. Bước biên tập audio giải giọng cho **từng block** và ghi `voiceId` thật vào block đó, nên một tập có nhiều giọng là chuyện bình thường.

Chưa nghe thấy khác biệt chỉ vì bảng `Voice` mới có bốn giọng giả lập và mock TTS đọc giọng nào cũng ra một kiểu. Cắm Kokoro vào là có nhiều giọng thật, phần định tuyến đã sẵn.

Thứ còn thiếu của "đa giọng" theo PLAN Phase 5 chỉ là **TTS tầng 2 — clone giọng**, và cái đó cần GPU.

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

## Model

`/model` trong Studio: kết nối Ollama, tải model về, kết nối OpenRouter, xem model nào hệ thống đang dùng.

### Model nào cho lần chạy nào

Ba tầng, cụ thể hơn thì thắng:

```
model chọn cho LẦN CHẠY này   ← ô "Model cho lần chạy này" ở form tạo truyện / viết cảnh
        ↓ không chọn
model của PROMPT              ← trang Prompt, ô "Model"
        ↓ không đặt
model MẶC ĐỊNH                ← trang Model
        ↓ chưa đặt
giá trị trong .env
```

**Model dùng cho từng việc KHÔNG nằm trong `.env`.** Chưa chọn gì thì hệ thống hỏi Ollama xem đang có model nào rồi lấy model đã tải đầu tiên hợp với loại việc. Không có model nào hợp thì **không chọn gì** — và job chạy tới bước đó dừng lại kèm câu chỉ rõ chỗ sửa:

> Chưa có model cho bước "write". Vào trang Model: tải một model về hoặc chọn model mặc định.

Trước đây chỗ này lùi về một tên ghi sẵn trong `.env` (`qwen3:14b`). Cái tên đó thành lời nói dối ngay khi máy không có model đó: job chết giữa chừng một tập đang viết dở với lỗi "không tìm thấy model", thay vì báo ngay lúc mở Studio. Nên các biến `OLLAMA_MODEL_*`, `OPENROUTER_MODEL_*`, `EMBED_MODEL` đã bị bỏ hẳn.

Trang Model ghi rõ giá trị đang đến từ đâu: **bạn chọn**, **tự chọn theo model đã tải**, hay **chưa có model**.

Model nhúng vector không bị chọn nhầm làm model viết và ngược lại — nhận diện theo tên (`embed`, `bge`, `gte-`, `minilm`, `e5-`). Là phỏng đoán, nhưng đoán nhầm ở đây rẻ: cùng lắm gợi ý sai một lần rồi chọn tay. Không đoán thì bước nhúng rơi vào một model viết truyện, và vector ra vô nghĩa mà không báo lỗi.

Provider `mock` là ngoại lệ: nó bỏ qua tên model, và cả lý do nó tồn tại là dựng được Studio/worker khi máy chưa có model nào. Bắt nó phải có model là phá đúng công dụng đó.

Danh sách model nhớ tạm 15 giây — một lượt chạy hàng loạt gọi tới hàng chục lần trong vài giây — và bị quên ngay sau khi tải hoặc xoá model. Ollama treo cũng không kéo theo hàng đợi: timeout 2 giây rồi coi như chưa tải gì.

Mặc định nằm trong bảng `Setting` chứ không chỉ trong `.env`, vì đổi model mặc định là việc làm thường xuyên lúc đang thử model nào viết hay hơn — mà sửa `.env` thì phải khởi động lại worker. Xoá ô đó là quay về giá trị `.env`, và trang có nhãn **từ .env** để biết đang lấy từ đâu.

Ô đặt mặc định là **ô chọn**, liệt kê thẳng model dùng được (Ollama: model đã tải; OpenRouter: model đang đặt cộng model đã dùng gần đây). Trước đây nó là ô gõ tay kèm `datalist` — danh sách chỉ hiện khi bấm vào rồi gõ, nên nhìn vào trang thì tưởng không có chỗ chọn. Vẫn giữ đường gõ tay để đặt sẵn model **chưa** tải. Model đang đặt mà chưa tải vẫn nằm trong danh sách, kèm nhãn *(chưa tải)*: bỏ nó ra thì mở trang lên ô chọn nhảy sang giá trị khác, bấm Lưu là ghi đè mất lựa chọn cũ mà không ai bấm vào nó.

Ô chọn model liệt kê **model Ollama đã tải** — chọn model chưa có thì job chết giữa chừng một tập đang viết dở — và **model OpenRouter đã dùng gần đây**. Không liệt kê hết hơn 300 model của OpenRouter: một ô select như thế không dùng được; muốn thử model mới thì vào trang Model, nơi có tìm kiếm và bảng giá. Không có gì để chọn thì ô đó ẩn hẳn.

**Tải model** — chọn model và mức lượng tử hoá, trang hiện sẵn lệnh `ollama pull` tương ứng để đối chiếu trước khi bấm.

| Mức | |
|---|---|
| `q4_K_M` | Cân bằng, phổ biến nhất — nhẹ nhất còn dùng tốt |
| `q5_K_M` | Nặng hơn ~12% |
| `q6_K` | Văn mượt hơn rõ, nặng hơn ~35% so với Q4 |
| `q8_0` | Gần như bản gốc, nặng gấp đôi Q4 |

**Tải thẳng từ Hugging Face.** Dán đường dẫn một kho GGUF rồi bấm quét: trang liệt kê đúng những bản lượng tử hoá kho đó **thật sự có**, kèm dung lượng, bấm là tải. Danh sách `q4_K_M`/`q5_K_M`/… cố định ở mục trên chỉ đúng với thư viện chính chủ của Ollama; kho trên HF mỗi nơi một kiểu — có kho chỉ có hai bản, có kho hơn hai chục bản kể cả các bản `IQ*`.

Ollama kéo được từ HF bằng tên `hf.co/{kho}:{QUANT}`, nên phần việc chỉ là bóc tên kho khỏi đường dẫn (chấp nhận cả `/tree/main`, `/blob/main/…`, tham số truy vấn) và gom file `.gguf` theo mức lượng tử hoá.

Dung lượng **cộng theo bản, không theo file**: model lớn hay bị chia chục phần, hiện dung lượng từng phần thì không ai ước lượng được phải tải bao nhiêu. Lấy `lfs.size` chứ không lấy `size` — với file LFS thì `size` chỉ là kích thước con trỏ, khoảng 130 byte.

Mức lượng tử hoá giữ **nguyên chữ hoa thường** như trong tên file: Ollama đối chiếu tag với chuỗi đó, đổi hoa thường là đi tìm một bản không tồn tại.

Kho không đọc được thì nói cả hai khả năng — không tồn tại, hoặc riêng tư/cần đồng ý điều khoản — vì Hugging Face cố tình trả 401 cho cả hai để không lộ kho nào có thật.

**Thanh tiến độ cộng theo từng lớp ảnh.** Ollama trả tiến độ theo lớp, mỗi lớp có `digest` riêng và `completed` đếm lại từ 0 — cộng dồn thẳng thì thanh tiến độ **nhảy lùi** mỗi khi sang lớp mới, nhìn như đang tải hỏng.

Tiến độ giữ trong bộ nhớ tiến trình API, không lưu DB: nó là trạng thái nhất thời. API khởi động lại thì Ollama **vẫn tải tiếp** (việc tải chạy bên phía Ollama), chỉ mất thanh tiến độ — bấm tải lại cùng model là Ollama nối tiếp phần đã có.

Dung lượng hiển thị bằng **GB thập phân** cho khớp con số trên ollama.com và trong `ollama list`; dùng GiB thì cùng một model hiện 2,8 ở đây và 3,0 ở kia.

Danh sách **Model đang có** chọn được ngay tại chỗ — mỗi model có nút đặt làm model viết / việc phụ / nhúng vector, và ghi rõ nó đang được dùng làm gì. Trước đây danh sách này chỉ có nút xoá: nhìn thấy model mình vừa tải mà không có cách nào dùng nó.

Provider `mock` dùng **chung** ô lưu model mặc định với `ollama`: nó vốn là bản đứng thay cho model chạy tại chỗ và nhận cùng kiểu tên. Tách ra thì cấu hình đặt lúc đang chạy giả lập — tức là lúc phần lớn người ta dựng máy — biến mất ngay khi chuyển sang Ollama thật, mà chẳng có gì báo.

**Cảnh báo model đã cấu hình mà chưa tải.** Không cảnh báo thì job chạy tới bước đó mới lỗi, lúc đó đang giữa chừng một lượt viết dài.

Ollama chưa chạy thì trang nói rõ *"Không có gì đang lắng nghe ở địa chỉ này"* — `fetch` của Node trả đúng một chuỗi "fetch failed" cho mọi lỗi mạng và giấu nguyên nhân trong `cause`.

**Không có model để chọn thì phải NÓI RA.** Trước đây danh sách rỗng thì ô chọn lặng lẽ đổi sang ô gõ tay, còn ô "Model cho lần chạy này" thì ẩn hẳn — nhìn vào chỉ thấy "Studio không cho chọn model", chứ không biết là Ollama chưa chạy, hay chưa tải model nào, hay đang chạy OpenRouter. Ba trường hợp đó giờ có ba lời giải thích khác nhau, kèm địa chỉ Ollama để khỏi phải đi tra `.env`.

### OpenRouter — model đám mây

Ollama chạy tại chỗ, rẻ và kín. OpenRouter là cổng vào hàng trăm model đám mây (Claude, GPT, Llama, Qwen…), dùng khi cần chất lượng văn mà máy ở nhà không với tới. Chọn **một trong hai**.

> ⚠️ **Nội dung rời khỏi máy.** Story Bible, bản thảo, lời thoại nhân vật — tất cả những gì gửi lên đều nằm trong tay nhà cung cấp. Cả kiến trúc hai DB dựng lên để bản nháp ở lại đây; bật OpenRouter là mở ngoại lệ đó một cách có ý thức. Trang `/model` nhắc lại điều này mỗi lần mở, và cảnh báo đó không tắt được.

Đặt `OPENROUTER_API_KEY` trong `.env` (lấy khoá ở `openrouter.ai/keys`) rồi khởi động lại API, sau đó chuyển ở trang `/model`. Khoá **không bao giờ** được trả về trình duyệt, kể cả dạng che bớt, và không lọt vào thông điệp lỗi — lỗi job được lưu vào DB rồi hiện lên Studio.

**Một trong hai, không chạy lẫn.** Khối “Chạy model ở đâu” trên trang `/model` chọn bên nào đang chạy. Lựa chọn nằm trong bảng `Setting` và được hỏi lại ở **mỗi lượt gọi model**, nên đổi là ăn ngay — kể cả worker đang chạy dở, không phải khởi động lại. `LLM_PROVIDER` trong `.env` chỉ là giá trị khởi đầu.

Chuyển sang OpenRouter có hỏi lại; chuyển về Ollama thì không — chiều đó không mất gì cả. Chưa kết nối được OpenRouter thì nút chuyển không hiện, vì chuyển sang lúc chưa có khoá là mọi job chết ngay ở lượt gọi model đầu tiên.

**Model mặc định nhớ riêng cho từng bên** (`model.ollama.write`, `model.openrouter.write`…). Dùng chung một khoá thì đổi sang OpenRouter, chọn `claude-sonnet`, rồi đổi về Ollama là mọi job đi hỏi Ollama một model tên `anthropic/claude-sonnet-4.5` và chết — mà đổi qua đổi lại chính là việc người ta sẽ làm. Ô nhập cũng kiểm theo luật của bên đang chạy: gõ `qwen3:32b` khi đang chạy OpenRouter thì báo lỗi ngay lúc lưu, thay vì đợi tới lúc job chạy giữa một tập đang viết dở.

Ô **“Model cho lần chạy này”** liệt kê model của bên đang chạy: với Ollama là model đã tải, với OpenRouter là model đang đặt cộng model đã dùng gần đây. Không đổ hơn 300 model của OpenRouter vào một ô select — muốn thử model mới thì vào trang Model, nơi có tìm kiếm và bảng giá.

**Bảng giá quy về “một tập”.** OpenRouter báo giá theo USD *mỗi token* (`0.000003`) — con số không ai ước lượng được. Trang `/model` đổi sang USD/1 triệu token, rồi nhân với số token **đo được từ các tập đã chạy thật** trên máy này (bảng `LlmRun`) để ra tiền mỗi tập. Chưa chạy tập nào thì không hiện ước tính, vì đoán bừa còn tệ hơn không nói gì.

Số token cộng **theo tập** trước rồi mới lấy trung bình: một tập gọi model chục lần (mỗi cảnh một lần, cộng tóm tắt, cộng metadata). Lấy trung bình trên từng lượt gọi ra giá của một *cảnh* — thấp hơn giá thật nhiều lần, mà ước tính chi phí thấp hơn thực tế là kiểu sai tệ nhất ở đây.

**Không giữ chỗ VRAM khi đang chạy đám mây.** Job LLM giữ chỗ `VRAM_LLM_MB` (mặc định 12 GB) suốt thời gian chạy, để hai model không cùng nhảy vào 16 GB rồi cả hai cùng chết. Gọi OpenRouter thì không dùng một MB VRAM nào, mà một lượt gọi kéo dài hàng chục giây — giữ chỗ trong lúc đó là chặn đứng clone giọng mà chẳng để làm gì. `openrouter` và `mock` giữ 0 MB, `ollama` giữ đủ.

**Nhúng vector không đi theo.** Model mặc định lấy theo provider đang bật, riêng embedding luôn chạy tại chỗ: nhúng một câu tốn vài ms, trả tiền cho đám mây để làm việc đó là vô lý.

Vài chỗ phải xử riêng vì OpenRouter không giống Ollama: không phải model nào cũng tôn trọng `response_format`, nên JSON trả về có thể bọc trong rào ```` ``` ```` và phải lột trước khi parse; `finish_reason: "length"` nghĩa là model bị cắt vì chạm trần token — im lặng thì cảnh cụt giữa câu mà không ai hiểu vì sao; và lỗi có thể đến **giữa luồng** khi HTTP đã 200 rồi (nhà cung cấp phía sau chết, hết tín dụng).

---

## Ngôn ngữ

Truyện viết bằng **tiếng Việt hoặc tiếng Anh**. Chọn ở màn tạo truyện; mặc định điền sẵn lấy từ trang `/model`, mục "Ngôn ngữ mặc định" (lùi về `CONTENT_LANGUAGE` trong `.env`).

Đây không phải ngôn ngữ giao diện Studio — Studio vẫn tiếng Việt.

**Ngôn ngữ gắn với BỘ, chốt lúc tạo.** Nằm ở `Series.language`, không đổi được sau. Đổi ngôn ngữ một bộ đang viết dở không phải là sửa một ô cấu hình: tóm tắt cung truyện, tên nhân vật, sự kiện đã truy hồi và giọng đọc của các tập cũ đều lệch theo. Đổi mặc định ở trang `/model` **không** đụng tới bộ đã có.

**Chỉ dẫn tiếng Anh, đầu ra theo cấu hình.** Mọi prompt trong `prompts/` và bảng `Prompt`, mọi khối ngữ cảnh dựng ở `@audio/core` (Story Bible, tóm tắt, sự kiện truy hồi) đều viết bằng **tiếng Anh**, bất kể truyện viết bằng tiếng gì — một thứ tiếng cho chỉ dẫn, thay vì nhân đôi toàn bộ prompt cho mỗi ngôn ngữ nội dung. Thứ tiếng của truyện chỉ quyết định **đầu ra**, và được chèn thành một chỉ thị ở đầu system prompt mỗi lượt gọi:

```
Write ALL output in Vietnamese. The instructions below are written in English —
that is the language of the instructions, NOT the language you must write in.
Character names, dialogue and narration must all be in Vietnamese.
```

Câu thứ hai là câu quan trọng nhất. Thiếu nó, model coi ngôn ngữ của chỉ dẫn là ngôn ngữ cần viết và trả về văn tiếng Anh trong khi cả bộ đang là tiếng Việt. Câu thứ ba nhắc riêng tên riêng và lời thoại vì đó là chỗ model hay lẫn nhất: văn đúng tiếng nhưng tên nhân vật và câu thoại vẫn theo tiếng của chỉ dẫn.

Truyện **tiếng Anh** thì câu thứ hai bị bỏ đi: chỉ dẫn và đầu ra cùng một thứ tiếng, nói "tiếng Anh KHÔNG phải ngôn ngữ cần viết" chỉ làm model rối. Chỉ thị dựng từ bảng `LANGUAGES`, nên thêm một thứ tiếng là thêm một dòng chứ không phải sửa hàm.

Prompt viết bằng tiếng Anh còn vì lý do khác: model mở cỡ 7–14B được huấn luyện chủ yếu trên tiếng Anh, và chỉ dẫn tiếng Anh được tuân thủ chặt hơn hẳn. Riêng **dữ liệu người viết nhập** — ý tưởng, thể loại và mô tả thể loại, thiết lập thế giới, tên nhân vật — giữ nguyên như đã gõ; đó là nội dung, không phải chỉ dẫn.

Chỉ thị đặt **lên trước** Story Bible chứ không phải sau: Bible dài hàng nghìn chữ, chỉ thị nằm dưới là chìm nghỉm. Mọi bước gọi model đều được chèn.

### Viết nháp bằng tiếng khác rồi chuyển ngữ

Model viết văn hay nhất không phải lúc nào cũng viết được thứ tiếng đầu ra: một finetune sáng tác dựng trên Mistral Small viết tiếng Anh rất khá và tiếng Việt gần như không dùng được. `Series.draftLanguage` cho phép viết nháp bằng tiếng nó mạnh, rồi bước **`TRANSLATE`** viết lại sang `Series.language`. Để trống là viết thẳng, không có bước nào ở giữa — mặc định vẫn là chuỗi cũ.

Bốn quyết định đáng nhớ:

**Chỉ bước `WRITE_SCENE` đổi tiếng.** Dàn ý vẫn dựng bằng ngôn ngữ đầu ra, nên Bible đã sẵn tên nhân vật và địa danh đúng tiếng — model viết văn tiếng Anh với tên Việt có sẵn. Để nó tự đặt tên thì được Sarah với John, dịch mãi không hết.

**Chuyển ngữ chạy TRƯỚC chốt duyệt.** Duyệt bản thảo ở thứ tiếng không phát ra loa thì chốt chặn không còn chặn được gì: thứ người đọc gật đầu và thứ người nghe nhận được là hai văn bản khác nhau.

**`Scene.text` luôn là bản dùng thật**, bản trước chuyển ngữ nằm ở `Scene.sourceText`. Nhờ vậy tóm tắt, sự kiện truy hồi, embedding và `Character.state` tự động chạy trên bản đầu ra mà không phải sửa gì — `summarize` vốn đọc `scriptText ?? draftText`. `sourceText` null cũng chính là dấu để biết cảnh nào còn phải chuyển ngữ, nên viết lại một cảnh giữa chừng là nó tự quay lại hàng đợi.

**Model chuyển ngữ nên là model KHÁC** với model viết — thứ viết tiếng Anh hay nhất thường là thứ viết tiếng Việt dở nhất. Đặt ở `Prompt.model` của bước `TRANSLATE`; `resolveModel` ba tầng lo phần còn lại.

Nó không sửa được chuyện dịch máy làm mất chất giọng, nhất là **xưng hô** — tiếng Anh chỉ có I/you nên quan hệ và vai vế bị xoá ngay ở bản gốc, và model chuyển ngữ phải tự dựng lại. Đóng đinh chúng vào `glossary` của Story Bible ("Tài ↔ ông Bảy: gọi *chú*, xưng *cháu*"): `glossary` được nạp vào Bible mọi lượt, và prompt chuyển ngữ nhận Bible.

**Giọng đọc lọc theo ngôn ngữ ở mọi tầng**, kể cả casting người viết đặt tay. Giọng tiếng Việt đọc văn tiếng Anh ra thứ không ai nghe được — và hỏng kiểu đó *không báo lỗi*, nó chỉ lộ ra khi ngồi nghe lại cả tập. Nên casting sai tiếng bị bỏ qua, và nếu không còn giọng nào đọc được thứ tiếng đó thì job dừng hẳn với thông báo nói rõ thiếu tiếng gì và có bao nhiêu giọng khác tiếng đang nằm đó.

`pnpm db:seed` tạo giọng giả lập cho **cả hai** thứ tiếng. Thiếu bộ giọng tiếng Anh thì truyện tiếng Anh không dựng được audio dù đang chạy giả lập.

**Feed RSS** lấy `<language>` theo bộ, và câu công bố dùng AI viết bằng đúng thứ tiếng đó — một câu tiếng Việt kẹp giữa phần mô tả tiếng Anh trông như lỗi, mà đây lại là câu bắt buộc phải để người nghe đọc được.

---

## Prompt

`/prompts` — tám bước gọi model, mỗi bước một prompt. **Prompt viết bằng tiếng Anh**; ngôn ngữ đầu ra do bộ truyện quyết, xem mục [Ngôn ngữ](#ngôn-ngữ).

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

Tham số sinh và **model riêng cho bước đó** sửa cùng chỗ — để trống thì dùng model theo cấu hình. Tham số vặn được cả ở trang Prompt lẫn mục **Tham số sinh** trên `/model`, nơi bày cả sáu bước trong một màn (chỉ bản đang thắng — sửa biến thể thì vào trang Prompt).

Trước đây tham số là một ô gõ JSON tay: gõ sai tên khoá thì **không có gì báo** — provider chỉ đọc các khoá nó biết, nên tham số lặng lẽ bị bỏ qua, văn vẫn ra, chỉ là ra bằng giá trị mặc định. Giờ là ô nhập số, khoảng hợp lệ do API cấp (Studio không chép lại, chép lại là sớm muộn giao diện cho nhập thứ API từ chối), và khoá lạ trong dữ liệu cũ được chỉ mặt. Ô trống nghĩa là **không đặt** — rơi về mặc định của provider, và số mờ trong ô chính là giá trị đó; khác hẳn `temperature: 0`, vốn là một lựa chọn thật.

Khoảng hợp lệ chặn hai thứ hay hỏng nhất: `temperature` trên 1.5 thì phần lớn model bắt đầu nói lảm nhảm, và `numCtx` quá nhỏ thì cắt mất phần đầu prompt — mất luôn Story Bible mà không báo gì. `temperature` cao thì văn biến hoá hơn nhưng dễ lạc — bước biên tập và tóm tắt để thấp. Bản mặc định không tắt và không xoá được: mọi thể loại chưa có biến thể đều rơi về nó.

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

## Studio là admin: hai DB, hai chiều khác nhau

```
local  ──► hosted   ĐẨY  — job PUBLISH, chỉ nội dung đã xuất bản
local  ◄── hosted   ĐỌC  — Studio đọc thẳng, KHÔNG sao chép về
```

**Không sao chép dữ liệu người nghe về local.** Sao về là tạo hai bản sao của cùng một sự thật: người ta bình luận lúc bạn đang ngủ, bạn duyệt ở bản local, bản hosted không biết — rồi đồng bộ theo hướng nào? Mỗi lần lệch là một lần phải quyết bên nào đúng, và không có câu trả lời chung.

Thay vào đó API của Studio giữ **cả hai kết nối**: `prisma` cho DB local, `prismaPlayer` cho DB hosted. Giao diện Studio không cắm vào DB nào — nó chỉ gọi API.

DB hosted ở xa nên **có lúc không với tới được**. Mọi truy vấn tới nó đi qua `withPlayerDb()`, đổi lỗi kết nối thành câu người đọc hiểu ("Nó đã chạy chưa, địa chỉ có đúng không?") thay vì "Có lỗi không lường trước". Trang đọc DB local không bị ảnh hưởng.

### Live có đang lệch không

Job `PUBLISH` xưa nay chỉ chạy lúc bấm Xuất bản và Gỡ xuất bản. Sửa tiêu đề, tạo lại kịch bản, hay xuất lại MP3 sau khi đã xuất bản thì **live giữ bản cũ mà chẳng có gì báo**.

Nay `Episode.syncedAt` ghi lại lần đẩy cuối, và Studio so nó với `updatedAt` của **tập, block và bản xuất** — thiếu một trong ba là bỏ sót một kiểu lệch. Trang Audio hiện nhãn *đã lệch* kèm nút **Đồng bộ lại**, và job MIX tự đẩy lại nếu tập đang ở trạng thái xuất bản.

Job đóng dấu bằng cách đặt `updatedAt` **bằng đúng** `syncedAt` — chính thao tác ghi đó cũng đụng `updatedAt`, để Prisma tự đặt thì hai mốc lệch vài mili-giây và tập vừa đồng bộ xong lại tự báo lệch. Từng dùng đệm 5 giây để né, nhưng nó che mất đúng thứ cần bắt: sửa ngay sau khi đồng bộ.

### Thống kê

`/thong-ke` — đọc thẳng DB hosted: lượt bắt đầu nghe, nghe hết, **phần trăm nghe được trung bình**, sao, yêu thích, bình luận. Con số thấp ở một tập cụ thể đáng xem lại: người nghe bỏ giữa chừng ở đó.

⚠️ Chỉ đếm được người **đã đăng nhập**. Ai nghe mà không đăng nhập thì vị trí chỉ nằm trong `localStorage` máy họ — đây là con số sàn dưới, không phải tổng lượt nghe.

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

## Ảnh bìa

Đặt ở trang bộ truyện trong Studio. Hiện ở trang chủ, trang bộ, màn hình khoá điện thoại (Media Session) và trong feed podcast.

Kiểm chuẩn Apple Podcasts **ngay lúc tải** — Apple từ chối feed sau khi nộp, chờ vài ngày rồi bị trả về thì đắt hơn nhiều so với báo ngay:

| | |
|---|---|
| **Chặn** | File không đọc được, hoặc nặng quá 5 MB |
| **Chỉ cảnh báo** | Không vuông · nhỏ hơn 1400×1400 · lớn hơn 3000×3000 · không phải JPEG/PNG |

Cảnh báo chứ không chặn, để đặt được bìa tạm trong lúc chờ ảnh thật — trang nghe vẫn dùng được, chỉ Apple mới từ chối.

Ảnh ghi ra tên tạm rồi mới kiểm, đạt mới `rename` vào chỗ thật. Ghi thẳng thì một file `.jpg` hỏng sẽ đè lên bìa `.jpg` đang dùng rồi bị bước dọn rác xoá mất — mất bìa cũ mà DB vẫn trỏ tới nó.

Kích thước ảnh đọc bằng `ffprobe` (nó coi ảnh là video một khung hình) nên không phải thêm thư viện xử lý ảnh.

---

## Hiệu ứng âm thanh

Bước biên tập audio đã tự sinh gợi ý (`Block.sfxHint`) — ví dụ *"tiếng phanh gấp"*. Thêm file vào Thư viện nhạc với loại **hiệu ứng**, rồi gán cho từng block ở trang Audio của tập.

Hiệu ứng phát ở **đầu block**, và được chèn **trước** khi trộn nhạc nền — nên tiếng cửa đập cũng kéo nhạc xuống như một cảnh audio drama thật. Chèn sau thì nhạc dửng dưng với mọi thứ trừ giọng nói.

Mốc thời gian tính đúng bằng cách `concatBlocks` xếp: tổng độ dài các block trước cộng tổng khoảng lặng trước đó. Lệch một khoảng lặng là mọi hiệu ứng sau đó rơi sai chỗ, nên phần này có test riêng.

Hiệu ứng **không** kéo dài tập: tràn quá đuôi thì bị cắt.

---

## Trang chủ

| Mục | |
|---|---|
| Banner | Bộ có cập nhật gần nhất |
| **Tiếp tục nghe** | Đọc vị trí từ `localStorage`, **không cần tài khoản**. Bỏ tập mới bấm vào rồi thoát (<30 giây) và tập nghe gần hết (còn <1 phút). |
| Tập mới nhất | 12 tập, kèm bìa |
| Truyện dài đang ra · Truyện ngắn | Hàng ngang cuộn được — trên điện thoại xếp lưới thì mỗi mục chiếm cả màn hình |
| Lọc thể loại | Qua query string `?the-loai=` nên gửi link được và nút Back hoạt động đúng |

**Chưa có "đang hot"** — cần số liệu lượt nghe, mà chưa có người nghe nào. Xếp theo lượt nghe của chính mình thì vô nghĩa.

"Tiếp tục nghe" render ở phía trình duyệt vì vị trí nằm trong `localStorage`, máy chủ không biết. Trang gửi xuống 200 tập gần nhất để lọc — nghe dở một tập cũ hơn thế là chuyện hiếm, và trần này giữ trang không phình khi bộ sưu tập lớn dần.

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

## Đăng nhập

**Tuỳ chọn, không phải cổng vào.** Không đăng nhập vẫn nghe được đầy đủ — vị trí nghe lưu trong `localStorage` của máy đó.

Hai đường vào, dùng Auth.js:

| | |
|---|---|
| **Google** | Không giữ mật khẩu nào. Cần `AUTH_GOOGLE_ID` và `AUTH_GOOGLE_SECRET`; để trống thì nút tự ẩn chứ không báo lỗi khó hiểu. |
| **Email + mật khẩu** | Tự chứa, chạy được ngay không cần dịch vụ ngoài. |

Bảng `User`/`Account`/`Session` **chỉ có ở DB hosted** — chúng nằm trong `PLAYER_ONLY_TABLES`, job đồng bộ không bao giờ đụng tới, và cũng không có gì để đồng bộ vì chúng chỉ sinh ra ở phía người nghe.

### Mật khẩu

Băm bằng `scrypt` có sẵn trong Node — không thêm dependency nào vào đường xác thực. Đo trên máy dựng (Apple M1):

| | Thời gian | Bộ nhớ mỗi lần |
|---|---|---|
| N=2^17 | 534 ms | ~128 MB |
| **N=2^16** ← đang dùng | **273 ms** | **~64 MB** |
| N=2^15 | 138 ms | ~32 MB |

Chọn 2^16 vì **bộ nhớ mới là ràng buộc thật**: scrypt tốn ~128·N·r byte cho mỗi lần băm đang chạy, nên ở 2^17 chỉ cần 10 người đăng nhập cùng lúc là ngốn 1,3 GB.

Tham số nhúng trong chuỗi lưu (`scrypt$N$r$p$salt$hash`) để sau này tăng N mà mật khẩu cũ vẫn kiểm được — không có thì đổi tham số là mọi người mất tài khoản cùng lúc.

**Giới hạn 10 lần thử / 15 phút / mỗi email.** Không phải chỉ để chặn dò mật khẩu: mỗi lần kiểm tốn 273 ms và 64 MB, gửi liên tục là làm sập máy chủ dù chẳng đoán đúng gì. Đếm trong bộ nhớ tiến trình — đủ cho một máy chủ, chạy nhiều tiến trình thì ngưỡng thực tế nhân lên theo số tiến trình.

Hai chỗ **cố tình không tiết lộ**: đăng nhập sai không phân biệt "không có email này" với "sai mật khẩu", và đăng ký trùng email báo chung chung. Phân biệt là cho người ngoài dò danh sách người dùng.

⚠️ `next-auth` v5 còn mang nhãn **beta** — đây là bản duy nhất hỗ trợ App Router.

---

## Yêu thích, đánh giá, bình luận

Cần đăng nhập. Đều gắn theo **tập**, không phải theo bộ.

| | |
|---|---|
| Yêu thích | Danh sách ở `/yeu-thich`. Tập bị gỡ xuất bản thì ẩn khỏi danh sách nhưng **giữ** bản ghi — xuất bản lại là thấy ngay. |
| Đánh giá | 1–5 sao. Chấm lại thì **đè** lên điểm cũ, không cộng thêm phiếu. |
| Bình luận | Vào **hàng chờ duyệt**, không hiện ngay. Neo được vào một mốc trong tập (`timestampMs`). |

**Vị trí nghe đồng bộ lên máy chủ** khi đã đăng nhập — mỗi 15 giây, thưa hơn nhiều so với 5 giây ghi vào `localStorage`. Lý do: ghi máy là xong, gửi lên máy chủ là một lượt mạng cộng một lượt ghi DB; nghe tập 20 phút mà gửi mỗi 5 giây là 240 lượt cho một người, còn sai lệch 15 giây khi đổi máy thì không ai để ý. Lúc phát lấy vị trí **xa hơn** giữa máy này và máy chủ.

### Kiểm duyệt bình luận

`/binh-luan` trong Studio. Bình luận mặc định `PENDING` và **không hiện ở trang nghe** — kể cả với chính người gửi, vì thấy nó thì tưởng đã công khai rồi.

Đây là lựa chọn có ý thức: trang nghe là trang công khai, mà chưa có ai trực để dọn spam theo giờ. Kèm giới hạn **30 giây giữa hai bình luận của cùng một người** — không có thì một người dán được hàng trăm cái vào hàng chờ và người duyệt phải dọn tay từng cái.

Route kiểm duyệt dùng `prismaPlayer` chứ không phải `prisma` như các route khác của Studio: bình luận nằm ở **DB hosted** vì người nghe sinh ra chúng.

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
