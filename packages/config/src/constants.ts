/** Hằng số dùng chung. Con số lấy từ PLAN.md — sửa ở đây, không rải trong code. */

/** Tốc độ đọc tiếng Việt, dùng để ước lượng thời lượng audio từ số từ. */
export const WORDS_PER_MINUTE = 160;

/** Kích thước một cảnh. Model 14B mất mạch sau ~1.500 token liên tục. */
export const SCENE_MIN_WORDS = 600;
export const SCENE_MAX_WORDS = 900;

/**
 * Bao nhiêu cảnh trong một chương.
 *
 * Chương là đơn vị KỂ — một mạch có mở có đóng, thường một buổi một chỗ. Cảnh
 * là đơn vị model VIẾT một lượt, và cỡ của nó do model quyết chứ không do
 * truyện: quá 900 từ liên tục là model 14B mất mạch. Nên chương dài bao nhiêu
 * là hệ quả của hai con số này, không phải thứ chọn tự do.
 */
export const SCENES_PER_CHAPTER = 2;

/** Bao nhiêu chương trong một tập. */
export const CHAPTERS_PER_EPISODE = 3;

/**
 * Độ dài tập mục tiêu ≈ 28 phút.
 *
 * Suy ra từ ba con số trên: 3 chương × 2 cảnh × ~750 từ. Trước khi có tầng
 * chương thì tập là 2.500 từ (15–20 phút) — thêm tầng vào mà giữ nguyên độ dài
 * thì mỗi tập chỉ còn một chương rưỡi, tức là tầng đó không tả được gì.
 */
export const EPISODE_TARGET_WORDS =
  CHAPTERS_PER_EPISODE * SCENES_PER_CHAPTER * ((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2);

/**
 * Chuẩn loudness (LUFS).
 *
 * `LUFS_WEB` −16 là chuẩn podcast/web và là mức mặc định dùng cho mọi bản xuất
 * hiện tại — phạm vi dự án đang dừng ở "ra file audio nghe được".
 *
 * Các mức dưới đây chỉ dùng khi thật sự xuất cho nền tảng đó. Lưu ý YouTube và
 * TikTok đều chỉ vặn XUỐNG chứ không vặn lên: master ở −19 thì phát ra nhỏ hơn
 * hẳn mọi video khác.
 */
export const LUFS_WEB = -16;
export const LUFS_YOUTUBE = -14;
export const LUFS_TIKTOK = -14;

/**
 * Video TikTok.
 *
 * Thời lượng KHÔNG phải ràng buộc: TikTok cho tới 60 phút với video upload sẵn
 * (10 phút nếu quay trong app). Một tập 15–20 phút vừa gọn trong MỘT video —
 * đừng cắt thành nhiều phần, người xem gặp phần 5 trước là mất mạch.
 *
 * Ràng buộc thật là DUNG LƯỢNG FILE, và nó khác nhau theo thiết bị upload:
 *   Android 72MB · iPhone ~287MB · Desktop ~500MB
 *
 * May là nội dung nén rất tốt (nền gần như tĩnh, chỉ waveform + phụ đề động),
 * nên 1,5 Mbps đủ đẹp: tập 20 phút ≈ 225MB — vừa desktop và iPhone.
 * Muốn upload từ Android thì phải hạ xuống ~0,4 Mbps hoặc cắt bớt.
 */
export const TIKTOK_WIDTH = 1080;
export const TIKTOK_HEIGHT = 1920;
export const TIKTOK_MAX_SECONDS = 60 * 60;
export const TIKTOK_VIDEO_BITRATE_KBPS = 1500;

/** Trần dung lượng theo thiết bị upload — chọn khi xuất. */
export const TIKTOK_SIZE_LIMIT_MB = { android: 72, ios: 287, desktop: 500 } as const;
export type TiktokUploadTarget = keyof typeof TIKTOK_SIZE_LIMIT_MB;

/**
 * Bitrate video để tập `durationMs` vừa trần dung lượng của thiết bị.
 * Trừ sẵn 160 kbps cho audio và 5% cho container/overhead.
 */
export function tiktokBitrateKbps(durationMs: number, target: TiktokUploadTarget): number {
  const budgetKbit = TIKTOK_SIZE_LIMIT_MB[target] * 8 * 1024 * 0.95;
  const seconds = Math.max(1, durationMs / 1000);
  const available = budgetKbit / seconds - 160;
  // Không vượt mức "đủ đẹp", và không xuống dưới mức còn xem được.
  return Math.max(300, Math.min(TIKTOK_VIDEO_BITRATE_KBPS, Math.floor(available)));
}

/** Nghỉ mặc định sau mỗi block (ms). */
export const DEFAULT_PAUSE_AFTER_MS = 400;

/** Âm lượng nhạc nền khi ducking. */
export const DEFAULT_BGM_VOLUME = 0.18;

/**
 * Ngân sách ngữ cảnh cho truyện dài.
 *
 * Tóm tắt từng tập tích luỹ tuyến tính: 30 tập × ~200 từ × ~1,8 token/từ ≈
 * 10.800 token, chiếm gần hết num_ctx 16384 và không còn chỗ để sinh.
 * Nên chỉ giữ nguyên văn vài tập gần nhất, phần cũ nén thành tóm tắt cung truyện.
 */
export const RECENT_SUMMARY_COUNT = 3;

/** Vượt ngưỡng này thì nén phần cũ lại. */
export const ARC_COMPRESS_THRESHOLD = 6;

/**
 * Truy hồi sự kiện bằng vector.
 *
 * `FACT_MIN_SIMILARITY` là chốt quan trọng: KHÔNG lấy top-K vô điều kiện.
 * Cảnh mở đầu một mạch truyện mới thì đúng ra chẳng cần sự kiện cũ nào —
 * lấy 5 sự kiện gần nhất trong trường hợp đó chỉ làm model phân tán.
 */
export const FACT_TOP_K = 6;
export const FACT_MIN_SIMILARITY = 0.35;

/** Tối đa bao nhiêu tình tiết bỏ ngỏ được nạp (luôn nạp, bất kể tương đồng). */
export const OPEN_THREAD_LIMIT = 5;

/** Tỉ lệ token/từ ước lượng cho tiếng Việt với tokenizer Qwen. */
export const TOKENS_PER_WORD_VI = 1.8;

/** Tên làn hàng đợi — phải khớp enum JobLane trong Prisma. */
export const LANES = ["LLM", "TTS_CPU", "TTS_GPU", "FFMPEG"] as const;
export type Lane = (typeof LANES)[number];

/** Concurrency mỗi làn. GPU luôn 1; CPU tính theo số nhân lúc chạy. */
export const LANE_CONCURRENCY: Record<Lane, number | "cpu-half"> = {
  LLM: 1,
  TTS_CPU: "cpu-half",
  TTS_GPU: 1,
  FFMPEG: 2,
};
