/**
 * Ràng buộc ảnh bìa cho podcast.
 *
 * Apple Podcasts từ chối feed không đạt — mà nó từ chối SAU khi bạn nộp, nên
 * kiểm ngay lúc tải lên rẻ hơn nhiều so với chờ vài ngày rồi bị trả về.
 * Nguồn: yêu cầu artwork của Apple Podcasts Connect.
 */
export const COVER_MIN_PX = 1400;
export const COVER_MAX_PX = 3000;
export const COVER_MAX_BYTES = 5 * 1024 * 1024;

/** Định dạng Apple nhận. WebP đẹp hơn nhưng Apple không đọc. */
export const COVER_FORMATS = ["jpeg", "png"] as const;

export interface CoverCheck {
  ok: boolean;
  /** Lỗi chặn hẳn — không lưu. */
  errors: string[];
  /** Lưu được, nhưng Apple Podcasts sẽ từ chối. */
  warnings: string[];
}

export function checkCover(input: {
  codec: string;
  width: number;
  height: number;
  sizeBytes: number;
}): CoverCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  // `mjpeg` là tên ffprobe đặt cho JPEG.
  const format = input.codec === "mjpeg" ? "jpeg" : input.codec;

  if (input.width === 0 || input.height === 0) {
    errors.push("Không đọc được kích thước — file này có phải ảnh không?");
    return { ok: false, errors, warnings };
  }
  if (input.sizeBytes > COVER_MAX_BYTES) {
    errors.push(`Ảnh nặng ${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB, tối đa 5 MB.`);
  }

  if (!COVER_FORMATS.includes(format as (typeof COVER_FORMATS)[number])) {
    warnings.push(`Định dạng ${format} — Apple Podcasts chỉ nhận JPEG hoặc PNG.`);
  }
  if (input.width !== input.height) {
    warnings.push(`Ảnh ${input.width}×${input.height} không vuông — Apple Podcasts đòi ảnh vuông.`);
  }
  if (input.width < COVER_MIN_PX || input.height < COVER_MIN_PX) {
    warnings.push(
      `Ảnh ${input.width}×${input.height} nhỏ hơn ${COVER_MIN_PX}×${COVER_MIN_PX} — Apple Podcasts sẽ từ chối.`,
    );
  }
  if (input.width > COVER_MAX_PX || input.height > COVER_MAX_PX) {
    warnings.push(`Ảnh ${input.width}×${input.height} lớn hơn ${COVER_MAX_PX}×${COVER_MAX_PX}.`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
