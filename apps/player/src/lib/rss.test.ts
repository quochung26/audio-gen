import { describe, expect, it } from "vitest";
import {
  absoluteAudioUrl,
  buildRssFeed,
  escapeXml,
  itunesDuration,
  originFromHeaders,
  type FeedEpisode,
  type FeedSeries,
} from "./rss";

const episode = (over: Partial<FeedEpisode> = {}): FeedEpisode => ({
  id: "ep1",
  number: 1,
  title: "Chuyến xe cuối cùng",
  summary: "Một tài xế đêm chở phải hành khách đã chết.",
  gist: null,
  durationMs: 1_265_000,
  publishedAt: new Date("2026-08-18T07:30:00Z"),
  audioRef: "series/abc/episodes/tap-1.mp3",
  sizeBytes: 25_300_000,
  ...over,
});

const series = (over: Partial<FeedSeries> = {}): FeedSeries => ({
  title: "Đường về",
  slug: "duong-ve",
  description: "Truyện kinh dị đường dài.",
  genre: "kinh dị",
  tags: ["ma", "đêm"],
  coverUrl: null,
  aiDisclosure: true,
  language: "vi",
  episodes: [episode()],
  ...over,
});

const opts = { baseUrl: "https://truyen.example.com" };

describe("escapeXml", () => {
  it("escapes & first, never escaping what it just produced", () => {
    // Wrong order turns "<" into "&amp;lt;" and breaks the whole XML file.
    expect(escapeXml("a < b & c")).toBe("a &lt; b &amp; c");
    expect(escapeXml("&")).toBe("&amp;");
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });

  it("escapes quotes, which are also used in attributes", () => {
    expect(escapeXml(`"x" 'y'`)).toBe("&quot;x&quot; &apos;y&apos;");
  });

  it("leaves Vietnamese diacritics alone", () => {
    expect(escapeXml("Đường về đêm mưa")).toBe("Đường về đêm mưa");
  });
});

describe("itunesDuration", () => {
  it("produces zero-padded HH:MM:SS", () => {
    expect(itunesDuration(1_265_000)).toBe("00:21:05");
    expect(itunesDuration(3_600_000)).toBe("01:00:00");
    expect(itunesDuration(0)).toBe("00:00:00");
  });

  it("does not wrap at 24 hours", () => {
    expect(itunesDuration(90_000_000)).toBe("25:00:00");
  });
});

describe("absoluteAudioUrl", () => {
  it("turns a store key into an absolute URL", () => {
    expect(absoluteAudioUrl("series/abc/x.mp3", "https://t.example.com")).toBe(
      "https://t.example.com/api/audio?key=series%2Fabc%2Fx.mp3",
    );
  });

  it("an http URL is left alone (R2 driver)", () => {
    expect(absoluteAudioUrl("https://cdn.example.com/x.mp3", "https://t.example.com")).toBe(
      "https://cdn.example.com/x.mp3",
    );
  });
});

describe("buildRssFeed", () => {
  it("has every tag podcast RSS requires", () => {
    const xml = buildRssFeed(series(), opts);
    for (const tag of [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0"',
      "<channel>",
      "<title>Đường về</title>",
      "<language>vi</language>",
      "<itunes:author>",
      "<itunes:explicit>false</itunes:explicit>",
      '<itunes:category text="Fiction"/>',
      "<item>",
      "<guid isPermaLink=\"false\">ep1</guid>",
      "<enclosure ",
    ]) {
      expect(xml).toContain(tag);
    }
  });

  it("the enclosure is an ABSOLUTE URL with a byte count and mime type", () => {
    // Podcast apps fetch from outside, and a relative URL downloads nothing.
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain(
      '<enclosure url="https://truyen.example.com/api/audio?key=series%2Fabc%2Fepisodes%2Ftap-1.mp3" length="25300000" type="audio/mpeg"/>',
    );
  });

  it("pubDate follows RFC 822", () => {
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain("<pubDate>Tue, 18 Aug 2026 07:30:00 GMT</pubDate>");
  });

  it("atom:link points back at the feed itself", () => {
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain(
      'href="https://truyen.example.com/story/duong-ve/rss.xml" rel="self"',
    );
  });

  it("strips a trailing / from baseUrl", () => {
    const xml = buildRssFeed(series(), { baseUrl: "https://truyen.example.com///" });
    expect(xml).toContain("<link>https://truyen.example.com/story/duong-ve</link>");
    expect(xml).not.toContain("example.com//");
  });

  it("states the AI involvement when aiDisclosure is on", () => {
    expect(buildRssFeed(series(), opts)).toContain("hỗ trợ của AI");
    expect(buildRssFeed(series({ aiDisclosure: false }), opts)).not.toContain("hỗ trợ của AI");
  });

  it("escapes XML characters in a title — one & breaks the whole file", () => {
    const xml = buildRssFeed(
      series({ title: "Ma & Người <thật>", episodes: [episode({ title: "Tập & cuối" })] }),
      opts,
    );
    expect(xml).toContain("<title>Ma &amp; Người &lt;thật&gt;</title>");
    expect(xml).toContain("<title>1. Tập &amp; cuối</title>");
    expect(xml).not.toMatch(/<title>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("a Vietnamese genre goes into the keywords, never into itunes:category", () => {
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain("<itunes:keywords>kinh dị, ma, đêm</itunes:keywords>");
    expect(xml).not.toContain('text="kinh dị"');
  });

  it("a missing cover drops the tag rather than emitting an empty href", () => {
    expect(buildRssFeed(series(), opts)).not.toContain("itunes:image");
  });

  it("the cover goes THROUGH the file-serving route, never joined straight onto the base", () => {
    // `coverUrl` is a store key. Joined directly it 404s, and podcast apps say nothing —
    // they just quietly show no artwork. This exact bug has happened.
    expect(buildRssFeed(series({ coverUrl: "library/covers/s1.jpg" }), opts)).toContain(
      '<itunes:image href="https://truyen.example.com/api/audio?key=library%2Fcovers%2Fs1.jpg"/>',
    );
  });

  it("a cover on R2 uses that URL directly", () => {
    expect(buildRssFeed(series({ coverUrl: "https://cdn.example.com/bia.jpg" }), opts)).toContain(
      '<itunes:image href="https://cdn.example.com/bia.jpg"/>',
    );
  });

  it("falls back to the gist when an episode has no summary", () => {
    const xml = buildRssFeed(
      series({ episodes: [episode({ summary: null, gist: "Tài xế gặp khách lạ." })] }),
      opts,
    );
    expect(xml).toContain("<description>Tài xế gặp khách lạ.</description>");
  });

  it("a missing sizeBytes gives 0 rather than an empty length", () => {
    const xml = buildRssFeed(series({ episodes: [episode({ sizeBytes: null })] }), opts);
    expect(xml).toContain('length="0"');
  });

  it("a story with no episodes still produces a valid feed, with no items", () => {
    const xml = buildRssFeed(series({ episodes: [] }), opts);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});

describe("originFromHeaders", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("takes the host from the headers, not the bind address", () => {
    // A real bug that happened: new URL(req.url).origin gives http://0.0.0.0:3001,
    // an address no podcast app can reach.
    expect(originFromHeaders(h({ host: "truyen.example.com" }), "http://0.0.0.0:3001")).toBe(
      "https://truyen.example.com",
    );
  });

  it("x-forwarded-* wins behind a proxy", () => {
    expect(
      originFromHeaders(
        h({ host: "10.0.0.5:3001", "x-forwarded-host": "truyen.example.com", "x-forwarded-proto": "https" }),
        "http://0.0.0.0:3001",
      ),
    ).toBe("https://truyen.example.com");
  });

  it("localhost uses http, not https", () => {
    expect(originFromHeaders(h({ host: "localhost:3001" }), "x")).toBe("http://localhost:3001");
    expect(originFromHeaders(h({ host: "127.0.0.1:3001" }), "x")).toBe("http://127.0.0.1:3001");
  });

  it("with no host it falls back to the default", () => {
    expect(originFromHeaders(h({}), "http://0.0.0.0:3001")).toBe("http://0.0.0.0:3001");
  });
});

describe("the story's language", () => {
  it("the <language> tag follows the story rather than being hardcoded to 'vi'", () => {
    expect(buildRssFeed(series({ language: "en" }), opts)).toContain("<language>en</language>");
    expect(buildRssFeed(series({ language: "vi" }), opts)).toContain("<language>vi</language>");
  });

  it("the AI disclosure is written in the story's own language", () => {
    // One Vietnamese sentence sandwiched in an English description looks like a bug, and
    // this is precisely the sentence listeners have to be able to read.
    const en = buildRssFeed(series({ language: "en" }), opts);
    expect(en).toContain("produced with the help of AI");
    expect(en).not.toContain("hỗ trợ của AI");

    expect(buildRssFeed(series({ language: "vi" }), opts)).toContain("hỗ trợ của AI");
  });

  it("a missing language still produces a valid feed", () => {
    expect(buildRssFeed(series({ language: "" }), opts)).toContain("<language>vi</language>");
  });
});
