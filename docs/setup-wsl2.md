# Hướng dẫn dựng môi trường — Windows + WSL2 + RTX 5060 Ti 16GB

> Đây là Phase 0 của [`PLAN.md`](../PLAN.md). Mục tiêu: có một môi trường chạy được LLM và TTS trên GPU, và **kiểm chứng được là nó thật sự chạy trên GPU**.
>
> Dự kiến: **nửa ngày đến một ngày.** Phần lớn thời gian là tải model, không phải cấu hình.

---

## ⚠️ Bốn lỗi phá hỏng cả buổi — đọc trước khi gõ lệnh đầu tiên

| Lỗi | Hậu quả |
|---|---|
| Cài driver NVIDIA **bên trong** WSL2 | Phá cơ chế passthrough. GPU biến mất khỏi WSL2. Gỡ ra rất mệt. |
| Dùng repo CUDA Linux thông thường thay vì repo `wsl-ubuntu` | Kéo theo driver hiển thị → hỏng như trên. |
| Cài gói meta `cuda` thay vì `cuda-toolkit-12-8` | Gói `cuda` kéo theo driver stub, gây lỗi tương tự. |
| Cài PyTorch bản `cu121`/`cu124` | Với Blackwell (`sm_120`), có thể **chạy mà cho kết quả sai âm thầm** — không crash, không báo lỗi. Nguy hiểm hơn cả lỗi rõ ràng. |

Quy tắc chung một câu: **Windows lo driver, WSL2 lo toolkit.**

---

## Bước 1 — Chuẩn bị phía Windows

### 1.1. Driver GPU

Tải và cài **NVIDIA Game Ready hoặc Studio Driver bản 570.xx trở lên** từ nvidia.com (RTX 50 series bắt buộc từ 570 trở lên).

Kiểm tra trong PowerShell:
```powershell
nvidia-smi
```
Phải thấy `GeForce RTX 5060 Ti` và `Driver Version: 5xx.xx`, `CUDA Version: 12.8` (hoặc cao hơn).

### 1.2. Cài WSL2 + Ubuntu

```powershell
wsl --install -d Ubuntu-24.04
wsl --update
wsl --set-default-version 2
```

Kiểm tra:
```powershell
wsl -l -v      # cột VERSION phải là 2
```

### 1.3. Cấu hình tài nguyên cho WSL2

WSL2 mặc định chỉ lấy 50% RAM máy. Tạo file `C:\Users\<tên-bạn>\.wslconfig`:

```ini
[wsl2]
memory=24GB
processors=8                  # chỉnh theo số nhân CPU, để lại 2 nhân cho Windows
swap=8GB
localhostForwarding=true
autoMemoryReclaim=gradual     # trả RAM lại cho Windows khi WSL2 rảnh
```

> **`memory=24GB` không phải cấp phát ngay 24GB.** Đây là trần; WSL2 chỉ lấy khi thật sự cần. `autoMemoryReclaim=gradual` giúp trả lại phần không dùng cho Windows — không có dòng này, WSL2 giữ RAM đã lấy cho tới khi tắt máy.

**24GB dùng vào việc gì:**

| Thành phần | RAM |
|---|---|
| Kokoro (CPU) + ffmpeg | ~2–3 GB |
| Postgres + Redis | ~1–2 GB |
| Node (Next.js dev + worker) | ~2–3 GB |
| Đệm cho model offload (xem mục 5.1 của `PLAN.md`) | tới ~10 GB |
| Page cache cho file model | phần còn lại |

Chỗ dư này chính là thứ cho phép chạy model MoE lớn hơn VRAM — xem ghi chú Qwen3-30B-A3B trong plan.

Áp dụng:
```powershell
wsl --shutdown
```
Rồi mở lại Ubuntu. Kiểm tra trong WSL2:
```bash
free -h        # cột total phải ~24Gi
nproc          # số nhân đúng như đã đặt
```

### 1.4. Kiểm tra dung lượng ổ đĩa

Model chiếm nhiều: Qwen3 14B Q6 ~12GB, thêm vài model nữa là 50–60GB. Ổ chứa WSL (thường C:) cần **dư ít nhất 150GB**.

Nếu ổ C chật, chuyển distro sang ổ khác:
```powershell
wsl --export Ubuntu-24.04 D:\backup\ubuntu.tar
wsl --unregister Ubuntu-24.04
wsl --import Ubuntu-24.04 D:\WSL\Ubuntu D:\backup\ubuntu.tar
```

---

## Bước 2 — CUDA Toolkit trong WSL2

Từ đây trở đi, mọi lệnh chạy **trong terminal Ubuntu (WSL2)**.

### 2.1. Xác nhận GPU đã nhìn thấy được

```bash
nvidia-smi
```

Phải ra thông tin card giống như bên Windows. **Nếu lệnh này không chạy, dừng lại và sửa bước 1 trước** — mọi thứ phía sau vô nghĩa nếu bước này chưa xong.

### 2.2. Cài CUDA Toolkit — dùng đúng repo `wsl-ubuntu`

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl wget

# Repo CUDA dành RIÊNG cho WSL — không dùng repo Linux thường
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update

# Cài TOOLKIT, không cài gói meta `cuda`
sudo apt install -y cuda-toolkit-12-8
```

Thêm vào `~/.bashrc`:
```bash
echo 'export PATH=/usr/local/cuda-12.8/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

Kiểm tra:
```bash
nvcc --version    # phải thấy release 12.8
```

### 2.3. Bật systemd (cần cho Docker và các service)

Tạo `/etc/wsl.conf`:
```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Rồi từ PowerShell: `wsl --shutdown`, mở lại Ubuntu, kiểm tra:
```bash
systemctl is-system-running    # "running" hoặc "degraded" đều được
```

---

## Bước 3 — Python + PyTorch (bản `cu128`)

```bash
sudo apt install -y python3.12 python3.12-venv python3-pip

mkdir -p ~/audio-truyen && cd ~/audio-truyen
python3.12 -m venv .venv
source .venv/bin/activate

# BẮT BUỘC dùng index cu128 cho Blackwell
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
```

### ✅ Kiểm tra quyết định — chạy đúng script này

```bash
python -c "
import torch
print('PyTorch:', torch.__version__)
print('CUDA available:', torch.cuda.is_available())
print('Device:', torch.cuda.get_device_name(0))
print('Capability:', torch.cuda.get_device_capability(0))
print('VRAM tổng:', round(torch.cuda.get_device_properties(0).total_memory/1024**3, 1), 'GB')
x = torch.randn(1000, 1000, device='cuda')
print('Phép tính thử:', float((x @ x.T).sum()))
"
```

**Kết quả phải là:**
- `CUDA available: True`
- `Capability: (12, 0)` ← đây là dấu hiệu Blackwell `sm_120` đã đúng
- Phép tính thử ra một số hữu hạn, **không phải `nan`**

> Nếu `Capability` ra `(12, 0)` nhưng phép tính thử ra `nan` hoặc số vô lý → **PyTorch sai bản**. Gỡ và cài lại đúng `cu128`. Đây chính là lỗi "chạy mà sai âm thầm" đã cảnh báo ở đầu.

---

## Bước 4 — Ollama + model viết truyện

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Giữ model trong VRAM giữa các lần gọi** (mặc định Ollama nhả model sau 5 phút; nạp lại mất 10–20 giây — rất phiền khi chạy hàng loạt). Vì trình cài đặt tạo Ollama thành systemd service, đặt biến môi trường ở cấp service:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=30m"
EOF
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

> Nếu bạn tự chạy `ollama serve` bằng tay thay vì dùng service, chỉ cần `export OLLAMA_KEEP_ALIVE=30m` trong `~/.bashrc` là đủ.

Tải model:
```bash
ollama pull qwen3:14b        # model chính — bản Q4 mặc định, ~9GB
ollama pull qwen3:8b         # model phụ cho tóm tắt/metadata
```

> Bản Q6 (`qwen3:14b-q6_K` nếu có trên registry) chất lượng tốt hơn, ~12GB. Tải sau khi đã xác nhận Q4 chạy ổn — đừng tải 2 bản cùng lúc khi chưa biết máy chịu được không.

### ✅ Kiểm tra Ollama thật sự dùng GPU

Mở **hai terminal**. Terminal 1:
```bash
watch -n 0.5 nvidia-smi
```

Terminal 2:
```bash
ollama run qwen3:14b "Viết một đoạn mở đầu truyện kinh dị 200 từ, bối cảnh một bến xe khách lúc nửa đêm."
```

**Nhìn terminal 1**: phải thấy tiến trình `ollama` chiếm VRAM (~9GB) và `GPU-Util` nhảy lên 80–100%.

**Nếu VRAM không đổi và GPU-Util ở 0%** → model đang chạy trên CPU. Đây là lỗi im lặng hay gặp nhất: chậm gấp 10–20 lần nhưng không báo gì. Kiểm tra `ollama serve` log để xem nó có tìm thấy CUDA không.

### ✅ Đo tốc độ thực tế

```bash
curl -s http://localhost:11434/api/generate -d '{
  "model": "qwen3:14b",
  "prompt": "Viết một cảnh truyện kinh dị 800 từ: nhân vật Tài là tài xế xe khách đêm, phát hiện hành khách cuối cùng không có bóng.",
  "stream": false,
  "options": { "num_ctx": 16384, "temperature": 0.9, "repeat_penalty": 1.1, "num_predict": 1500 }
}' | python -c "
import sys, json
d = json.load(sys.stdin)
print(d['response'][:400], '...\n')
print('Tokens sinh ra:', d['eval_count'])
print('Tốc độ: %.1f tok/s' % (d['eval_count'] / (d['eval_duration']/1e9)))
"
```

**Mốc kỳ vọng: 35–45 tok/s** với Qwen3 14B Q4. Nếu dưới 10 tok/s → đang chạy CPU.

Đây cũng là lần đầu bạn **đọc văn tiếng Việt do model viết**. Đánh giá thật: có đọc được không? có lặp không? có sai ngữ pháp không? Câu trả lời quyết định model nào dùng chính thức.

---

## Bước 5 — Kokoro TTS tiếng Việt

> **Kokoro chạy trên CPU — không cần GPU.** Model chỉ 82M tham số (bản ONNX lượng tử hoá chưa tới 100MB), CPU xử lý vẫn nhanh hơn thời gian thực nhiều lần. Đây là lựa chọn có chủ đích: để dành toàn bộ VRAM cho LLM. Xem mục 6.1 của `PLAN.md`.
>
> Nhắc lại: Kokoro bản chính thức **chưa hỗ trợ tiếng Việt**. Đây là bản fine-tune cộng đồng, chất lượng chưa được kiểm chứng rộng. Mục tiêu của bước này là **biết được nó có dùng được không**, không phải để tích hợp ngay.

```bash
cd ~/audio-truyen && source .venv/bin/activate
sudo apt install -y espeak-ng ffmpeg
pip install huggingface_hub soundfile numpy

# ONNX Runtime bản CPU — KHÔNG cài onnxruntime-gpu, không cần thiết
pip install onnxruntime

# Tải cả hai bản để so sánh
huggingface-cli download anphunl/Kokoro-Vietnamese --local-dir models/kokoro-vi-anphunl
huggingface-cli download contextboxai/Kokoro-Vietnamese --local-dir models/kokoro-vi-contextbox
```

Mỗi repo có hướng dẫn chạy riêng — đọc `README.md` trong thư mục vừa tải để biết cách gọi và tên voicepack. Ưu tiên đường ONNX nếu repo có sẵn (bản `contextboxai` có kèm ONNX); nếu chỉ có checkpoint PyTorch thì vẫn chạy CPU được bằng `torch.device("cpu")`, chỉ chậm hơn ONNX một chút.

> **Không cần chạy Kokoro trên GPU.** Nếu repo mặc định gọi `.cuda()`, sửa thành CPU. Đặt nó lên GPU chỉ nhanh thêm chút ít nhưng tranh mất VRAM của LLM — thứ đang cần từng GB.

### Đoạn văn thử — dùng đúng đoạn này cho cả hai bản

Đoạn này cố tình chứa những thứ TTS tiếng Việt hay sai:

```
Đêm ba mươi tháng Chạp năm 1975, ông Tài lái chuyến xe khách cuối cùng từ Buôn Ma Thuột về Nha Trang.
Đồng hồ chỉ 2 giờ 47 phút sáng. Radio trên xe phát bản tin thời tiết, rồi im bặt.
"Chú ơi, cho cháu xuống ở ngã ba Phú Lộc." — giọng cô gái ngồi ghế số 12 vang lên phía sau.
Ông Tài liếc gương chiếu hậu. Ghế số 12 trống không.
Ông đạp phanh. Chiếc xe rú lên, trượt dài 30 mét trên mặt đường ướt.
```

**Bốn tiêu chí nghe và chấm điểm:**

| Tiêu chí | Câu hỏi |
|---|---|
| **Tên riêng** | "Buôn Ma Thuột", "Nha Trang", "Phú Lộc" đọc đúng không? |
| **Số** | "1975", "2 giờ 47 phút", "số 12", "30 mét" — đọc thành chữ đúng chưa? |
| **Hội thoại** | Câu trong ngoặc kép có ngữ điệu khác phần dẫn truyện không? |
| **Độ bền** | Nghe liên tục 5 phút có mệt tai không? Đây là tiêu chí quan trọng nhất — truyện dài 15–20 phút. |

**Đo tốc độ:** ghi lại tỉ lệ *giây audio tạo ra / giây xử lý*. Kokoro trên CPU phải đạt ít nhất **5× thời gian thực** (1 phút audio trong dưới 12 giây) — đủ nhanh cho pipeline. Nếu đạt 10–20× thì càng tốt.

Trong lúc chạy, mở terminal khác gõ `nvidia-smi` để **xác nhận VRAM không tăng** — đúng như thiết kế.

---

## Bước 6 — Thử engine clone giọng (cho đa nhân vật)

> ⚠️ **Kiểm tra giấy phép TRƯỚC khi thử.** Xem mục 6.3 của `PLAN.md`. Nếu bạn có ý định thương mại (bật kiếm tiền TikTok, bán cho đài), thì **viXTTS/XTTS-v2 không dùng được** — giấy phép Coqui cấm thương mại. F5-TTS vướng dữ liệu CC-BY-NC.
>
> **Nếu chắc chắn sẽ thương mại hoá:** bỏ qua bước này, dùng Piper (giấy phép MIT) ở bước 6b thay thế. Đỡ mất công thử một thứ rồi không dùng được.

### 6a. viXTTS / F5-TTS Vietnamese (chỉ khi dùng phi thương mại)

Clone thử 2 giọng từ 2 mẫu audio ~10 giây, đọc lại đoạn hội thoại ở bước 5.

Đo: **VRAM chiếm bao nhiêu** (quan trọng — phải cộng với 9–12GB của LLM để biết có chạy song song được không) và **tốc độ** so với Kokoro.

> Nếu gặp lỗi `no kernel image is available for execution on the device` → repo đang ghim PyTorch cũ. Gỡ torch của repo và cài lại bản `cu128` như bước 3.

### 6b. Piper `vi_VN` — phương án sạch về pháp lý

```bash
pip install piper-tts
python -m piper.download_voices vi_VN-vais1000-medium
echo "Đêm ba mươi tháng Chạp năm 1975, ông Tài lái chuyến xe khách cuối cùng." \
  | piper -m vi_VN-vais1000-medium -f test-piper.wav
```

Nghe và so với Kokoro. Piper giọng máy móc hơn nhưng cực nhanh, chạy được cả trên CPU, và **giấy phép MIT — thoải mái thương mại**.

---

## Bước 7 — ffmpeg với NVENC

```bash
ffmpeg -encoders 2>/dev/null | grep nvenc
```

Phải thấy `h264_nvenc` và `hevc_nvenc`.

**Nếu không thấy**, bản ffmpeg của Ubuntu không bật NVENC. Dùng bản build sẵn:
```bash
wget https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz
tar xf ffmpeg-master-latest-linux64-gpl.tar.xz
sudo cp ffmpeg-master-latest-linux64-gpl/bin/* /usr/local/bin/
```

Kiểm tra encode thật:
```bash
ffmpeg -f lavfi -i testsrc=duration=5:size=1080x1920:rate=30 \
  -c:v h264_nvenc -preset p5 -y test-nvenc.mp4
```
Chạy xong không lỗi là được.

---

## Bước 8 — Postgres + Redis

```bash
# Docker trong WSL2 (cần systemd đã bật ở bước 2.3)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

cd ~/audio-truyen
cat > docker-compose.yml <<'EOF'
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: audio_truyen
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
EOF

docker compose up -d
docker compose ps      # cả hai phải "running"
```

---

## Bảng kiểm cuối Phase 0

Đánh dấu từng dòng. **Chỉ sang Phase 1 khi tất cả đều ✅.**

| # | Kiểm tra | Cách xác nhận |
|---|---|---|
| 1 | GPU nhìn thấy trong WSL2 | `nvidia-smi` chạy được |
| 2 | CUDA Toolkit đúng bản | `nvcc --version` → 12.8 |
| 3 | PyTorch nhận Blackwell | `get_device_capability()` → `(12, 0)`, phép tính thử không ra `nan` |
| 4 | Ollama chạy trên GPU | `nvidia-smi` thấy VRAM tăng, GPU-Util > 80% khi sinh chữ |
| 5 | Tốc độ đạt kỳ vọng | ≥ 30 tok/s với Qwen3 14B |
| 6 | **Văn tiếng Việt đọc được** | Tự đọc bản thảo 800 từ và chấm điểm thật |
| 7 | **Kokoro VN nghe được, chạy CPU** | Nghe đoạn thử chấm 4 tiêu chí ở bước 5; `nvidia-smi` xác nhận VRAM không tăng; đạt ≥5× thời gian thực |
| 8 | Giấy phép TTS đã rõ | Biết chắc engine nào dùng được cho mục đích của bạn |
| 9 | NVENC hoạt động | `test-nvenc.mp4` tạo thành công |
| 10 | Postgres + Redis chạy | `docker compose ps` → running |

### Hai câu hỏi phải trả lời được trước khi viết code

Toàn bộ kế hoạch đứng trên hai giả định này. Nếu một trong hai là "không", **đừng sang Phase 1** — quay lại đổi model hoặc đổi engine trước.

1. **Văn do model viết có đủ hay để đăng không?** (không phải "có đọc được không" — mà "bạn có dám đăng lên kênh của mình không")
2. **Giọng đọc có nghe được 15 phút liên tục không?**

---

## Sự cố hay gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `nvidia-smi` không chạy trong WSL2 | Driver Windows cũ, hoặc đã lỡ cài driver Linux trong WSL | Cập nhật driver Windows ≥570. Nếu đã cài driver Linux: `sudo apt purge nvidia-*` rồi `wsl --shutdown`. |
| `torch.cuda.is_available()` → `False` | PyTorch bản CPU, hoặc thiếu `LD_LIBRARY_PATH` | Cài lại với `--index-url .../cu128`. Kiểm tra `echo $LD_LIBRARY_PATH`. |
| Kết quả tính toán ra `nan` | PyTorch sai bản (`cu121`/`cu124`) với `sm_120` | Gỡ sạch torch, cài lại `cu128`. |
| `no kernel image is available` | Thư viện build cho kiến trúc cũ | Repo đang ghim torch cũ — ép cài `cu128` trong venv của repo đó. |
| Ollama chậm bất thường (<10 tok/s) | Đang chạy CPU | Xem log `ollama serve`. Kiểm tra `nvidia-smi` lúc đang sinh chữ. |
| WSL2 hết RAM, tiến trình bị kill | `.wslconfig` chưa cấu hình | Đặt `memory=` và `swap=`, rồi `wsl --shutdown`. |
| Build/cài đặt chậm kinh khủng | Project để ở `/mnt/c/...` | Chuyển vào `~/` trong WSL2. |
| Hết dung lượng ổ C | Model chiếm nhiều | Chuyển distro sang ổ khác (bước 1.4), hoặc `docker system prune`. |

---

## Nguồn tham khảo

- [CUDA on WSL User Guide — NVIDIA](https://docs.nvidia.com/cuda/wsl-user-guide/index.html)
- [Getting PyTorch to Actually Use Your RTX 5090: WSL2 Setup for Blackwell (sm_120)](https://medium.com/@getnetdemil/getting-pytorch-to-actually-use-your-rtx-5090-a-complete-wsl2-setup-guide-for-blackwell-sm-120-61f86f64abc4)
- [Setting Up a Local AI Workstation on an RTX 5070 Ti (Blackwell) with WSL2](https://fahimkabir2213.medium.com/setting-up-a-local-ai-workstation-on-an-rtx-5070-ti-blackwell-with-wsl2-every-step-and-every-41fb7f553673)
- [WSL2 Local AI on Windows: GPU Passthrough, Fixed (2026)](https://insiderllm.com/guides/wsl2-local-ai-windows-guide/)
- [anphunl/Kokoro-Vietnamese](https://huggingface.co/anphunl/Kokoro-Vietnamese) · [contextboxai/Kokoro-Vietnamese](https://huggingface.co/contextboxai/Kokoro-Vietnamese)
