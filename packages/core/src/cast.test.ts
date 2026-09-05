import { describe, expect, it } from "vitest";
import { mergeCast, normalizeCast, renderCastForOutline } from "./cast";

const tai = { name: "Tài", role: "tài xế xe khách", isNarrator: true };

describe("normalizeCast", () => {
  it("bỏ mục không có tên", () => {
    expect(normalizeCast([tai, { name: "  " }, { name: "" }])).toHaveLength(1);
  });

  it("khử trùng tên KHÔNG phân biệt hoa thường", () => {
    // `(seriesId, name)` là ràng buộc duy nhất — hai hàng cùng tên là job chết
    // lúc tạo bộ, sau khi đã gọi model xong.
    const out = normalizeCast([{ name: "Tài" }, { name: "tài" }, { name: "TÀI " }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Tài");
  });

  it("gộp khoảng trắng thừa trong tên", () => {
    expect(normalizeCast([{ name: "ông   Bảy" }])[0]!.name).toBe("ông Bảy");
  });

  it("giữ ĐÚNG MỘT người dẫn, người đầu tiên thắng", () => {
    // Hai người dẫn thì bước biên tập audio gán block dẫn truyện cho ai cũng
    // được, và giọng đổi giữa chừng mà không có gì báo.
    const out = normalizeCast([tai, { name: "Hạnh", isNarrator: true }]);
    expect(out.map((c) => c.isNarrator)).toEqual([true, false]);
  });

  it("trường rỗng thành null chứ không phải chuỗi rỗng", () => {
    expect(normalizeCast([{ name: "Tài", role: "  ", description: "" }])[0]).toMatchObject({
      role: null,
      description: null,
      voiceHint: null,
    });
  });
});

describe("renderCastForOutline", () => {
  it("không chọn ai thì trả về rỗng — prompt vẫn hợp lệ", () => {
    // Y như `renderWorldForOutline`: bỏ trống là model tự nghĩ nhân vật, đúng
    // hành vi cũ.
    expect(renderCastForOutline([])).toBe("");
    expect(renderCastForOutline([{ name: " " }])).toBe("");
  });

  it("nêu tên, vai, tính cách, cách nói, ngoại hình và chất giọng", () => {
    const out = renderCastForOutline([
      {
        name: "Tài",
        role: "tài xế",
        description: "lì",
        speech: "cộc lốc",
        appearance: "gầy, da sạm",
        voiceHint: "nam trung niên",
      },
    ]);
    expect(out).toContain("Tài");
    expect(out).toContain("tài xế");
    expect(out).toContain("lì");
    expect(out).toContain("cộc lốc");
    expect(out).toContain("gầy, da sạm");
    expect(out).toContain("nam trung niên");
  });

  it("nói rõ KHÔNG được đổi tên — chỗ model hay tự tiện nhất", () => {
    expect(renderCastForOutline([tai])).toMatch(/Do not rename/i);
  });

  it("đã có người dẫn thì chốt luôn, không mời model chọn lại", () => {
    const out = renderCastForOutline([tai]);
    expect(out).toContain("(the narrator)");
    expect(out).toMatch(/only that one/i);
  });

  it("chưa ai làm người dẫn thì bảo model chọn một", () => {
    const out = renderCastForOutline([{ name: "Tài" }]);
    expect(out).toMatch(/pick one of them or add one/i);
  });

  it("vẫn cho thêm nhân vật mới — dàn chọn trước là sàn, không phải trần", () => {
    expect(renderCastForOutline([tai])).toMatch(/may add more/i);
  });
});

describe("mergeCast", () => {
  const generated = [
    { name: "Tài", role: "tài xế đường dài", voiceHint: "nam trung niên", isNarrator: true },
    { name: "Cô gái áo trắng", role: "hành khách bí ẩn", voiceHint: "nữ trẻ" },
  ];

  it("giữ nhân vật model tự thêm — dàn chọn trước là sàn, không phải trần", () => {
    expect(mergeCast([{ name: "Tài" }], generated).map((c) => c.name)).toEqual([
      "Tài",
      "Cô gái áo trắng",
    ]);
  });

  it("người viết gõ gì thì thắng cái đó", () => {
    const out = mergeCast([{ name: "Tài", role: "thợ điện" }], generated);
    expect(out[0]!.role).toBe("thợ điện");
  });

  it("ô người viết BỎ TRỐNG thì lấy phần model gợi ý", () => {
    // Chọn một thẻ mới có mỗi cái tên vẫn phải ra nhân vật dùng được.
    const out = mergeCast([{ name: "Tài" }], generated);
    expect(out[0]).toMatchObject({ role: "tài xế đường dài", voiceHint: "nam trung niên" });
  });

  it("giữ nguyên cardId của thẻ đã chọn", () => {
    expect(mergeCast([{ name: "Tài", cardId: "card_1" }], generated)[0]!.cardId).toBe("card_1");
  });

  it("chưa chỉ định người dẫn thì nhận theo model", () => {
    expect(mergeCast([{ name: "Tài" }], generated)[0]!.isNarrator).toBe(true);
  });

  it("người viết đã chỉ định người dẫn thì model KHÔNG được đổi", () => {
    // Model gán cờ cho Tài; người viết chọn Cô gái áo trắng. Không chốt thì
    // người thắng phụ thuộc thứ tự khử trùng — im lặng và đổi giữa các lần chạy.
    const out = mergeCast(
      [{ name: "Tài" }, { name: "Cô gái áo trắng", isNarrator: true }],
      generated,
    );
    expect(out.find((c) => c.isNarrator)?.name).toBe("Cô gái áo trắng");
    expect(out.filter((c) => c.isNarrator)).toHaveLength(1);
  });

  it("KHÔNG ai làm người dẫn thì người đầu tiên nhận vai", () => {
    // Bộ không có người dẫn thì bước biên tập audio không tra ra ai cho block
    // dẫn truyện, và cả tập rơi về giọng mặc định mà không báo gì.
    const out = mergeCast([], [{ name: "Tài" }, { name: "Hạnh" }]);
    expect(out[0]!.isNarrator).toBe(true);
    expect(out.filter((c) => c.isNarrator)).toHaveLength(1);
  });

  it("dàn rỗng hoàn toàn thì trả về rỗng, không ném", () => {
    expect(mergeCast([], [])).toEqual([]);
  });

  it("không chọn ai thì y như cũ: chỉ có dàn model sinh", () => {
    expect(mergeCast([], generated).map((c) => c.name)).toEqual(["Tài", "Cô gái áo trắng"]);
  });
});
