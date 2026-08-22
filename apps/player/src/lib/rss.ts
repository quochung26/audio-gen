import { playableUrl } from "./audio-url";

/**
 * Dựng RSS podcast cho một bộ truyện.
 *
 * Tách khỏi route để test được: đây là chỗ dễ sai lặng lẽ — thiếu một trường
 * bắt buộc thì app podcast từ chối feed mà không nói lý do, và escape sai một
 * dấu `&` trong tiêu đề là hỏng cả file XML chứ không riêng tập đó.
 */

export interface FeedEpisode {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  gist: string | null;
  durationMs: number | null;
  publishedAt: Date | null;
  /** Tham chiếu file MP3 — khoá trong kho hoặc URL http. */
  audioRef: string;
  sizeBytes: number | null;
}

export interface FeedSeries {
  title: string;
  slug: string;
  description: string | null;
  genre: string;
  tags: string[];
  coverUrl: string | null;
  aiDisclosure: boolean;
  /** Ngôn ngữ của bộ — trình đọc podcast dùng để lọc và để đọc đúng tiếng. */
  language: string;
  episodes: FeedEpisode[];
}

export interface FeedOptions {
  /** Gốc URL công khai, ví dụ "https://truyen.example.com". Không có dấu / cuối. */
  baseUrl: string;
  /** Ngôn ngữ feed. */
  author?: string;
}

/**
 * Thoát ký tự cho nội dung XML.
 *
 * `&` phải thay TRƯỚC các ký tự khác, nếu không sẽ thoát chồng lên phần vừa
 * sinh ra ("&lt;" thành "&amp;lt;").
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** HH:MM:SS — dạng `itunes:duration` hiển thị được ở mọi app. */
export function itunesDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Đổi tham chiếu trong DB thành URL tuyệt đối — app podcast tải từ bên ngoài. */
export function absoluteAudioUrl(ref: string, baseUrl: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  return new URL(playableUrl(ref), baseUrl).toString();
}

export function buildRssFeed(series: FeedSeries, opts: FeedOptions): string {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const link = `${base}/truyen/${series.slug}`;
  const author = opts.author ?? "Audio Truyện";

  const description = [
    series.description,
    // Ghi rõ có AI tham gia. Một số nền tảng yêu cầu, và người nghe có quyền biết.
    series.aiDisclosure ? aiNote(series.language) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const items = series.episodes.map((ep) => renderItem(ep, series, base, author)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(series.title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>${escapeXml(series.language || "vi")}</language>
    <atom:link href="${escapeXml(`${link}/rss.xml`)}" rel="self" type="application/rss+xml"/>
    <itunes:author>${escapeXml(author)}</itunes:author>
    <itunes:owner><itunes:name>${escapeXml(author)}</itunes:name></itunes:owner>
    <itunes:summary>${escapeXml(description)}</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>serial</itunes:type>
${renderCategory(series)}${renderImage(series, base)}${items}
  </channel>
</rss>
`;
}

/**
 * Danh mục iTunes là danh sách tiếng Anh CỐ ĐỊNH, không map được từ `genre`
 * tiếng Việt tự do. Nên để "Fiction" và đẩy genre thật xuống keywords.
 */
function renderCategory(series: FeedSeries): string {
  const keywords = [series.genre, ...series.tags].filter(Boolean).join(", ");
  return (
    `    <itunes:category text="Fiction"/>\n` +
    (keywords ? `    <itunes:keywords>${escapeXml(keywords)}</itunes:keywords>\n` : "")
  );
}

/**
 * Apple đòi ảnh bìa mới nhận feed. Không có bìa thì bỏ thẻ đi — feed vẫn là RSS
 * hợp lệ và app podcast thường vẫn đọc được, chỉ không lên được Apple Podcasts.
 */
function renderImage(series: FeedSeries, base: string): string {
  if (!series.coverUrl) return "";
  // Qua `absoluteAudioUrl` chứ KHÔNG ghép thẳng vào base: `coverUrl` là khoá
  // trong kho, phải đi qua route phục vụ file. Ghép thẳng ra URL 404 — mà app
  // podcast không báo gì, chỉ lặng lẽ không hiện bìa.
  return `    <itunes:image href="${escapeXml(absoluteAudioUrl(series.coverUrl, base))}"/>\n`;
}

function renderItem(ep: FeedEpisode, series: FeedSeries, base: string, author: string): string {
  const audio = absoluteAudioUrl(ep.audioRef, base);
  const summary = ep.summary ?? ep.gist ?? "";
  const parts = [
    `      <title>${escapeXml(`${ep.number}. ${ep.title}`)}</title>`,
    `      <link>${escapeXml(`${base}/nghe/${ep.id}`)}</link>`,
    `      <description>${escapeXml(summary)}</description>`,
    // isPermaLink="false" vì đây là id nội bộ, không phải URL.
    `      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>`,
    // `length` là số byte. Podcast app dùng nó để hiện tiến độ tải; sai thì
    // thanh tải chạy loạn. Không biết thì để 0 còn hơn đoán.
    `      <enclosure url="${escapeXml(audio)}" length="${ep.sizeBytes ?? 0}" type="audio/mpeg"/>`,
    `      <itunes:author>${escapeXml(author)}</itunes:author>`,
    `      <itunes:episode>${ep.number}</itunes:episode>`,
    `      <itunes:explicit>false</itunes:explicit>`,
  ];

  if (ep.publishedAt) {
    // RFC 822. `toUTCString()` ra đúng dạng RSS cần.
    parts.push(`      <pubDate>${ep.publishedAt.toUTCString()}</pubDate>`);
  }
  if (ep.durationMs) {
    parts.push(`      <itunes:duration>${itunesDuration(ep.durationMs)}</itunes:duration>`);
  }
  void series;

  return `    <item>\n${parts.join("\n")}\n    </item>`;
}

/**
 * Gốc URL công khai suy từ request.
 *
 * KHÔNG dùng `new URL(req.url).origin`: Next trả về địa chỉ tiến trình đang
 * bind, thường là `http://0.0.0.0:3001` — app podcast không tới được. Host thật
 * mà client gõ nằm ở header.
 *
 * `x-forwarded-*` đứng trước vì khi có proxy thì `host` là host nội bộ.
 */
export function originFromHeaders(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return fallback;
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^127\.|^\[?::1\]?/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Lời công bố dùng AI, viết bằng đúng thứ tiếng của bộ truyện.
 *
 * Một câu tiếng Việt kẹp giữa phần mô tả tiếng Anh trông như lỗi, mà đây lại là
 * câu bắt buộc phải để người nghe đọc được.
 */
function aiNote(language: string): string {
  return language === "en"
    ? "This content was produced with the help of AI."
    : "Nội dung có sự hỗ trợ của AI.";
}
