/**
 * Podcast cover art constraints.
 *
 * Apple Podcasts rejects a feed that does not meet them — and it rejects AFTER submission,
 * so checking at upload time is far cheaper than waiting days for a rejection.
 * Source: Apple Podcasts Connect's artwork requirements.
 */
export const COVER_MIN_PX = 1400;
export const COVER_MAX_PX = 3000;
export const COVER_MAX_BYTES = 5 * 1024 * 1024;

/** The formats Apple accepts. WebP looks better but Apple cannot read it. */
export const COVER_FORMATS = ["jpeg", "png"] as const;

export interface CoverCheck {
  ok: boolean;
  /** A blocking error — do not save. */
  errors: string[];
  /** Saveable, but Apple Podcasts will reject it. */
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

  // `mjpeg` is what ffprobe calls JPEG.
  const format = input.codec === "mjpeg" ? "jpeg" : input.codec;

  if (input.width === 0 || input.height === 0) {
    errors.push("Could not read the dimensions — is this file an image?");
    return { ok: false, errors, warnings };
  }
  if (input.sizeBytes > COVER_MAX_BYTES) {
    errors.push(`The image is ${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB, the maximum is 5 MB.`);
  }

  if (!COVER_FORMATS.includes(format as (typeof COVER_FORMATS)[number])) {
    warnings.push(`Format ${format} — Apple Podcasts only accepts JPEG or PNG.`);
  }
  if (input.width !== input.height) {
    warnings.push(`The image is ${input.width}×${input.height}, not square — Apple Podcasts requires square art.`);
  }
  if (input.width < COVER_MIN_PX || input.height < COVER_MIN_PX) {
    warnings.push(
      `The image is ${input.width}×${input.height}, smaller than ${COVER_MIN_PX}×${COVER_MIN_PX} — Apple Podcasts will reject it.`,
    );
  }
  if (input.width > COVER_MAX_PX || input.height > COVER_MAX_PX) {
    warnings.push(`The image is ${input.width}×${input.height}, larger than ${COVER_MAX_PX}×${COVER_MAX_PX}.`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
