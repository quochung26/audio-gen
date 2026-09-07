import { playableUrl } from "./audio-url";

/**
 * Build the podcast RSS for one story.
 *
 * Separate from the route so it can be tested: this is a place that fails silently —
 * a missing required field makes podcast apps reject the feed with no reason given, and
 * one unescaped `&` in a title breaks the whole XML file, not just that episode.
 */

export interface FeedEpisode {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  gist: string | null;
  durationMs: number | null;
  publishedAt: Date | null;
  /** The MP3 reference — a store key or an http URL. */
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
  /** The story's language — podcast readers use it to filter and to pronounce correctly. */
  language: string;
  episodes: FeedEpisode[];
}

export interface FeedOptions {
  /** The public URL root, e.g. "https://truyen.example.com". No trailing slash. */
  baseUrl: string;
  /** The feed's language. */
  author?: string;
}

/**
 * Escape characters for XML content.
 *
 * `&` has to be replaced BEFORE the others, or it escapes what was just produced
 * ("&lt;" becoming "&amp;lt;").
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** HH:MM:SS — the `itunes:duration` form every app can display. */
export function itunesDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Turn a DB reference into an absolute URL — podcast apps fetch from outside. */
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
    // States plainly that AI was involved. Some platforms require it, and listeners have a right to know.
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
 * The iTunes categories are a FIXED English list, which cannot be mapped from a free-form
 * Vietnamese `genre`. So it says "Fiction" and pushes the real genre into the keywords.
 */
function renderCategory(series: FeedSeries): string {
  const keywords = [series.genre, ...series.tags].filter(Boolean).join(", ");
  return (
    `    <itunes:category text="Fiction"/>\n` +
    (keywords ? `    <itunes:keywords>${escapeXml(keywords)}</itunes:keywords>\n` : "")
  );
}

/**
 * Apple requires cover art before it accepts a feed. Without one the tag is dropped — the
 * feed is still valid RSS and podcast apps usually still read it, it just cannot reach
 * Apple Podcasts.
 */
function renderImage(series: FeedSeries, base: string): string {
  if (!series.coverUrl) return "";
  // Through `absoluteAudioUrl` and NOT joined straight onto the base: `coverUrl` is a store
  // key and has to go through the file-serving route. Joined directly it 404s — and podcast
  // apps say nothing, they just quietly show no artwork.
  return `    <itunes:image href="${escapeXml(absoluteAudioUrl(series.coverUrl, base))}"/>\n`;
}

function renderItem(ep: FeedEpisode, series: FeedSeries, base: string, author: string): string {
  const audio = absoluteAudioUrl(ep.audioRef, base);
  const summary = ep.summary ?? ep.gist ?? "";
  const parts = [
    `      <title>${escapeXml(`${ep.number}. ${ep.title}`)}</title>`,
    `      <link>${escapeXml(`${base}/nghe/${ep.id}`)}</link>`,
    `      <description>${escapeXml(summary)}</description>`,
    // isPermaLink="false" because this is an internal id, not a URL.
    `      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>`,
    // `length` is a byte count. Podcast apps use it for the download progress bar; wrong,
    // and the bar goes haywire. 0 when unknown beats a guess.
    `      <enclosure url="${escapeXml(audio)}" length="${ep.sizeBytes ?? 0}" type="audio/mpeg"/>`,
    `      <itunes:author>${escapeXml(author)}</itunes:author>`,
    `      <itunes:episode>${ep.number}</itunes:episode>`,
    `      <itunes:explicit>false</itunes:explicit>`,
  ];

  if (ep.publishedAt) {
    // RFC 822. `toUTCString()` produces exactly the form RSS needs.
    parts.push(`      <pubDate>${ep.publishedAt.toUTCString()}</pubDate>`);
  }
  if (ep.durationMs) {
    parts.push(`      <itunes:duration>${itunesDuration(ep.durationMs)}</itunes:duration>`);
  }
  void series;

  return `    <item>\n${parts.join("\n")}\n    </item>`;
}

/**
 * The public URL root, derived from the request.
 *
 * Do NOT use `new URL(req.url).origin`: Next returns the address the process bound to,
 * usually `http://0.0.0.0:3001` — unreachable for a podcast app. The real host the client
 * typed is in the headers.
 *
 * `x-forwarded-*` comes first because behind a proxy `host` is the internal host.
 */
export function originFromHeaders(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return fallback;
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^127\.|^\[?::1\]?/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The AI disclosure, written in the story's own language.
 *
 * One Vietnamese sentence sandwiched in an English description looks like a bug, and this
 * is precisely the sentence listeners have to be able to read.
 */
function aiNote(language: string): string {
  return language === "en"
    ? "This content was produced with the help of AI."
    : "Nội dung có sự hỗ trợ của AI.";
}
