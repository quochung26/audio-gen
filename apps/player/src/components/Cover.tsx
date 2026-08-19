import { playableUrl } from "@/lib/audio-url";

/**
 * Ảnh bìa bộ truyện.
 *
 * Chưa có bìa thì vẽ một ô rỗng CÙNG KÍCH THƯỚC chứ không bỏ trống — thiếu ảnh
 * mà layout co lại thì danh sách nhảy loạn khi vài bộ có bìa vài bộ không.
 */
export function Cover({ src, size }: { src: string | null; size: number }) {
  const style = { width: size, height: size };

  if (!src) {
    return (
      <div
        style={style}
        aria-hidden
        className="shrink-0 rounded bg-neutral-900 ring-1 ring-neutral-800 ring-inset"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playableUrl(src)}
      alt=""
      style={style}
      loading="lazy"
      className="shrink-0 rounded object-cover"
    />
  );
}
