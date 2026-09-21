import { describe, expect, it } from "vitest";
import {
  computeStyleStats,
  MIN_SCENES_FOR_STATS,
  renderStyleStats,
  type StyleStats,
} from "./style-stats";

/** Build `n` scenes from a template, so a deliberate tic can be planted in all of them. */
function scenes(n: number, make: (i: number) => string): string[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

/**
 * Ten scenes that share nothing but their opening word.
 *
 * They have to genuinely differ: written from one template with a number swapped in,
 * every phrase in them repeats ten times and the whole story reads as one enormous tic —
 * which is correct behaviour, and useless for testing one planted tic against.
 */
const BANK = [
  "Chiếc xe dừng lại bên lề đường vắng và không ai bước xuống cả trong đêm đó.",
  "Chiếc vé nhàu nát nằm im dưới ghế, mực đã nhoè đi gần hết từ lâu.",
  "Chiếc đèn pha quét qua hàng cây ven đường rồi tắt ngấm giữa chừng không báo trước.",
  "Chiếc áo mưa treo sau cabin vẫn còn nhỏ nước xuống sàn gỗ đã mục ruỗng.",
  "Chiếc đồng hồ trên bảng điều khiển chạy chậm mất bảy phút suốt ba năm nay rồi.",
  "Chiếc cặp lồng cơm nguội ngắt bị bỏ quên ở hàng ghế cuối từ chuyến trước.",
  "Chiếc gương chiếu hậu bên phải đã nứt một đường dài từ mùa mưa năm ngoái.",
  "Chiếc radio cũ chỉ bắt được đúng một đài, và đài ấy phát nhạc suốt đêm.",
  "Chiếc khăn quàng màu đỏ bị gió cuốn khỏi tay bà cụ rơi xuống vũng nước.",
  "Chiếc cầu sắt kêu lên một tiếng dài khi bánh xe lăn qua khớp nối giữa nhịp.",
];

const ORDINARY = (i: number) => BANK[i % BANK.length]!;

describe("computeStyleStats", () => {
  it("says nothing until there is enough prose to mean something", () => {
    expect(computeStyleStats({ scenes: scenes(MIN_SCENES_FOR_STATS - 1, ORDINARY) })).toBeNull();
    expect(computeStyleStats({ scenes: [] })).toBeNull();
  });

  it("measures the sentence lengths write-scene.md asks about", () => {
    const s = computeStyleStats({ scenes: scenes(10, ORDINARY) })!;
    expect(s.scenes).toBe(10);
    expect(s.sentences.median).toBeGreaterThan(8);
    expect(s.sentences.shortRatio).toBe(0);
  });

  // "A page whose sentences average under eight words reads as a telegram" — the prompt
  // says so and nothing measured it.
  it("catches a story written in clipped sentences", () => {
    const s = computeStyleStats({ scenes: scenes(10, () => "Hắn đi. Trời mưa. Không ai nói.") })!;
    expect(s.sentences.shortRatio).toBe(1);
    expect(s.sentences.median).toBeLessThan(8);
  });

  describe("phrases the story keeps reaching for", () => {
    it("finds a tic planted across scenes", () => {
      const s = computeStyleStats({
        scenes: scenes(10, (i) => `${ORDINARY(i)}\nKhóe môi hắn khẽ nhếch lên một chút.`),
      })!;
      expect(s.phrases.some((p) => p.text.includes("khóe môi hắn khẽ nhếch"))).toBe(true);
    });

    it("leaves character names alone — they are the point, not a tic", () => {
      const s = computeStyleStats({
        scenes: scenes(10, (i) => `${ORDINARY(i)}\nTài Ngọc Lâm bước vào phòng.`),
        names: ["Tài", "Ngọc", "Lâm"],
      })!;
      expect(s.phrases.some((p) => p.text.includes("tài"))).toBe(false);
    });

    it("ignores a phrase that only one scene repeats", () => {
      // That is prose-lint's self_duplication, and reporting it twice helps nobody.
      const once = scenes(10, ORDINARY);
      once[0] = `${once[0]}\nMột câu lặp. Một câu lặp. Một câu lặp. Một câu lặp.`;
      const s = computeStyleStats({ scenes: once })!;
      expect(s.phrases.some((p) => p.text.includes("một câu lặp"))).toBe(false);
    });

    it("reports the longest form, not its own halves", () => {
      const s = computeStyleStats({
        scenes: scenes(10, (i) => `${ORDINARY(i)}\nKhóe môi hắn khẽ nhếch lên một chút.`),
      })!;
      const hits = s.phrases.filter((p) => p.text.startsWith("khóe môi hắn"));
      expect(hits).toHaveLength(1);
    });
  });

  it("catches a whole sentence reused in another scene", () => {
    const line = "Ông tự hỏi chuyến này có phải chuyến cuối cùng trong đêm hay không.";
    const s = computeStyleStats({
      scenes: scenes(10, (i) => (i % 3 === 0 ? `${ORDINARY(i)}\n${line}` : ORDINARY(i))),
    })!;
    expect(s.repeated.some((r) => r.text.startsWith("ông tự hỏi chuyến này"))).toBe(true);
  });

  it("lets a sentence repeated inside ONE scene alone", () => {
    // Also prose-lint's business, and reporting it in two places helps nobody.
    const line = "Ông tự hỏi chuyến này có phải chuyến cuối cùng trong đêm hay không.";
    const once = scenes(10, ORDINARY);
    once[0] = `${once[0]}\n${line}\n${line}\n${line}`;
    const s = computeStyleStats({ scenes: once })!;
    expect(s.repeated).toEqual([]);
  });

  describe("how scenes open", () => {
    // Found rather than looked up: a list of time words only catches the tic someone
    // predicted, and the defect is the same whatever the word turns out to be.
    it("names the word the most scenes open on", () => {
      const s = computeStyleStats({ scenes: scenes(10, ORDINARY) })!;
      expect(s.opening).toEqual({ word: "chiếc", scenes: 10 });
    });

    it("says nothing when every scene opens differently", () => {
      const varied = [
        "Mưa rơi suốt đêm không dứt trên mái tôn cũ kỹ của bến xe.",
        "Hắn bước xuống bậc thềm, tay còn cầm nguyên chiếc vé đã nhàu.",
        "Đêm ấy không ai trong bến nhớ đã thấy chuyến xe rời đi lúc nào.",
        "Bà cụ ngồi im trên ghế đá, nhìn theo ánh đèn pha xa dần.",
        "Tiếng còi vọng lại từ phía cuối đường, khàn và đứt quãng.",
        "Xe lăn bánh chậm rãi qua khúc cua ngập nước bên rìa thị trấn.",
        "Trời hửng sáng khi chiếc xe cuối cùng cũng về tới đầu ngõ.",
        "Cô gái áo trắng đứng đó, ướt sũng, không hề run rẩy chút nào.",
      ];
      expect(computeStyleStats({ scenes: varied })!.opening).toBeNull();
    });
  });
});

describe("renderStyleStats", () => {
  const stats = computeStyleStats({
    scenes: scenes(10, (i) => `${ORDINARY(i)}\nKhóe môi hắn khẽ nhếch lên một chút.`),
  })!;

  it("says nothing at all when there are no numbers", () => {
    expect(renderStyleStats(null)).toBe("");
  });

  it("reports the counts", () => {
    const t = renderStyleStats(stats);
    expect(t).toContain("Across the last 10 scenes");
    expect(t).toContain("khóe môi hắn khẽ nhếch");
  });

  // write-scene.md already says how to write. Repeating the instruction beside the
  // evidence teaches the model to read the evidence as more instruction.
  it("does not tell the model what to do about any of it", () => {
    expect(renderStyleStats(stats)).not.toMatch(/\b(avoid|vary|do not|should|stop)\b/i);
  });

  it("leaves out the parts that have nothing to say", () => {
    const bare: StyleStats = {
      scenes: 9,
      sentences: { median: 14, mean: 15, shortRatio: 0.1, longRatio: 0.2 },
      phrases: [],
      repeated: [],
      opening: null,
      ending: { medianWords: 12, shortRatio: 0.1 },
    };
    const t = renderStyleStats(bare);
    expect(t).not.toContain("keeps reaching for");
    expect(t).not.toContain("open on the word");
    expect(t).toContain("Across the last 9 scenes");
  });
});
