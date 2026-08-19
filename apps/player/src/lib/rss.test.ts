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
  episodes: [episode()],
  ...over,
});

const opts = { baseUrl: "https://truyen.example.com" };

describe("escapeXml", () => {
  it("thoát & trước, không thoát chồng lên phần vừa sinh", () => {
    // Sai thứ tự thì "<" ra "&amp;lt;" và cả file XML hỏng.
    expect(escapeXml("a < b & c")).toBe("a &lt; b &amp; c");
    expect(escapeXml("&")).toBe("&amp;");
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });

  it("thoát dấu nháy vì còn dùng trong thuộc tính", () => {
    expect(escapeXml(`"x" 'y'`)).toBe("&quot;x&quot; &apos;y&apos;");
  });

  it("giữ nguyên dấu tiếng Việt", () => {
    expect(escapeXml("Đường về đêm mưa")).toBe("Đường về đêm mưa");
  });
});

describe("itunesDuration", () => {
  it("ra HH:MM:SS có đệm 0", () => {
    expect(itunesDuration(1_265_000)).toBe("00:21:05");
    expect(itunesDuration(3_600_000)).toBe("01:00:00");
    expect(itunesDuration(0)).toBe("00:00:00");
  });

  it("không quay vòng ở 24 giờ", () => {
    expect(itunesDuration(90_000_000)).toBe("25:00:00");
  });
});

describe("absoluteAudioUrl", () => {
  it("khoá trong kho thành URL tuyệt đối", () => {
    expect(absoluteAudioUrl("series/abc/x.mp3", "https://t.example.com")).toBe(
      "https://t.example.com/api/audio?key=series%2Fabc%2Fx.mp3",
    );
  });

  it("URL http giữ nguyên (driver R2)", () => {
    expect(absoluteAudioUrl("https://cdn.example.com/x.mp3", "https://t.example.com")).toBe(
      "https://cdn.example.com/x.mp3",
    );
  });
});

describe("buildRssFeed", () => {
  it("có đủ thẻ bắt buộc của RSS podcast", () => {
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

  it("enclosure là URL TUYỆT ĐỐI kèm số byte và mime type", () => {
    // App podcast tải từ ngoài, URL tương đối là tải hụt.
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain(
      '<enclosure url="https://truyen.example.com/api/audio?key=series%2Fabc%2Fepisodes%2Ftap-1.mp3" length="25300000" type="audio/mpeg"/>',
    );
  });

  it("pubDate đúng RFC 822", () => {
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain("<pubDate>Tue, 18 Aug 2026 07:30:00 GMT</pubDate>");
  });

  it("atom:link tự trỏ về chính feed", () => {
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain(
      'href="https://truyen.example.com/truyen/duong-ve/rss.xml" rel="self"',
    );
  });

  it("bỏ dấu / thừa ở baseUrl", () => {
    const xml = buildRssFeed(series(), { baseUrl: "https://truyen.example.com///" });
    expect(xml).toContain("<link>https://truyen.example.com/truyen/duong-ve</link>");
    expect(xml).not.toContain("example.com//");
  });

  it("ghi rõ nội dung có AI khi bật aiDisclosure", () => {
    expect(buildRssFeed(series(), opts)).toContain("hỗ trợ của AI");
    expect(buildRssFeed(series({ aiDisclosure: false }), opts)).not.toContain("hỗ trợ của AI");
  });

  it("thoát ký tự XML trong tiêu đề — một dấu & là hỏng cả file", () => {
    const xml = buildRssFeed(
      series({ title: "Ma & Người <thật>", episodes: [episode({ title: "Tập & cuối" })] }),
      opts,
    );
    expect(xml).toContain("<title>Ma &amp; Người &lt;thật&gt;</title>");
    expect(xml).toContain("<title>1. Tập &amp; cuối</title>");
    expect(xml).not.toMatch(/<title>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("genre tiếng Việt xuống keywords, không nhét vào itunes:category", () => {
    const xml = buildRssFeed(series(), opts);
    expect(xml).toContain("<itunes:keywords>kinh dị, ma, đêm</itunes:keywords>");
    expect(xml).not.toContain('text="kinh dị"');
  });

  it("thiếu ảnh bìa thì bỏ thẻ, không sinh href rỗng", () => {
    expect(buildRssFeed(series(), opts)).not.toContain("itunes:image");
  });

  it("ảnh bìa đi QUA route phục vụ file, không ghép thẳng vào base", () => {
    // `coverUrl` là khoá trong kho. Ghép thẳng ra URL 404, mà app podcast
    // không báo gì — chỉ lặng lẽ không hiện bìa. Đã dính đúng lỗi này.
    expect(buildRssFeed(series({ coverUrl: "library/covers/s1.jpg" }), opts)).toContain(
      '<itunes:image href="https://truyen.example.com/api/audio?key=library%2Fcovers%2Fs1.jpg"/>',
    );
  });

  it("bìa lưu ở R2 thì dùng URL đó thẳng", () => {
    expect(buildRssFeed(series({ coverUrl: "https://cdn.example.com/bia.jpg" }), opts)).toContain(
      '<itunes:image href="https://cdn.example.com/bia.jpg"/>',
    );
  });

  it("dùng gist khi tập chưa có summary", () => {
    const xml = buildRssFeed(
      series({ episodes: [episode({ summary: null, gist: "Tài xế gặp khách lạ." })] }),
      opts,
    );
    expect(xml).toContain("<description>Tài xế gặp khách lạ.</description>");
  });

  it("thiếu sizeBytes thì để 0 chứ không sinh length rỗng", () => {
    const xml = buildRssFeed(series({ episodes: [episode({ sizeBytes: null })] }), opts);
    expect(xml).toContain('length="0"');
  });

  it("bộ chưa có tập nào vẫn ra feed hợp lệ, không có item", () => {
    const xml = buildRssFeed(series({ episodes: [] }), opts);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});

describe("originFromHeaders", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("lấy host từ header chứ không phải địa chỉ bind", () => {
    // Đây là lỗi thật đã gặp: new URL(req.url).origin ra http://0.0.0.0:3001,
    // app podcast không tới được địa chỉ đó.
    expect(originFromHeaders(h({ host: "truyen.example.com" }), "http://0.0.0.0:3001")).toBe(
      "https://truyen.example.com",
    );
  });

  it("x-forwarded-* thắng khi đứng sau proxy", () => {
    expect(
      originFromHeaders(
        h({ host: "10.0.0.5:3001", "x-forwarded-host": "truyen.example.com", "x-forwarded-proto": "https" }),
        "http://0.0.0.0:3001",
      ),
    ).toBe("https://truyen.example.com");
  });

  it("localhost dùng http, không phải https", () => {
    expect(originFromHeaders(h({ host: "localhost:3001" }), "x")).toBe("http://localhost:3001");
    expect(originFromHeaders(h({ host: "127.0.0.1:3001" }), "x")).toBe("http://127.0.0.1:3001");
  });

  it("không có host thì lùi về giá trị dự phòng", () => {
    expect(originFromHeaders(h({}), "http://0.0.0.0:3001")).toBe("http://0.0.0.0:3001");
  });
});
