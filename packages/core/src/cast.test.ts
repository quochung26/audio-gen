import { describe, expect, it } from "vitest";
import { mergeCast, namesMentionedIn, normalizeCast, renderCastForOutline } from "./cast";

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
        outfit: "áo sơ mi bạc",
        voiceHint: "nam trung niên",
      },
    ]);
    expect(out).toContain("Tài");
    expect(out).toContain("tài xế");
    expect(out).toContain("lì");
    expect(out).toContain("cộc lốc");
    expect(out).toContain("gầy, da sạm");
    expect(out).toContain("áo sơ mi bạc");
    expect(out).toContain("nam trung niên");
  });

  it("nói rõ KHÔNG được đổi tên — chỗ model hay tự tiện nhất", () => {
    expect(renderCastForOutline([tai])).toMatch(/Do not rename/i);
  });

  it("KHÔNG nhắc gì tới người dẫn truyện", () => {
    // Ai đọc phần dẫn là việc của khâu audio, mà khâu đó có thể không bao giờ
    // chạy. Nói với model rằng một nhân vật là "người dẫn" còn đẩy nó sang kiểu
    // người đó kể chuyện, trong khi write-scene bảo viết ngôi thứ ba.
    expect(renderCastForOutline([tai])).not.toMatch(/narrator/i);
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

  it("model đánh dấu người dẫn thì KHÔNG được nhận", () => {
    // Dàn ý không còn quyết ai đọc phần dẫn. Dữ liệu cũ hoặc model bướng vẫn
    // có thể trả về cờ đó, và nó phải bị bỏ qua.
    expect(mergeCast([{ name: "Tài" }], generated)[0]!.isNarrator).toBe(false);
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

  it("KHÔNG tự gán người dẫn khi không ai được chọn", () => {
    // Người dẫn là ô casting của khâu audio. Gán bừa người đầu tiên thì cả bộ
    // có thể được dẫn bằng giọng nữ trẻ mà chẳng ai quyết điều đó — thứ tự phụ
    // thuộc model trả về cái gì trước.
    const out = mergeCast([], [{ name: "Tài" }, { name: "Hạnh" }]);
    expect(out.some((c) => c.isNarrator)).toBe(false);
  });

  it("người viết chọn thì vẫn giữ đúng một người", () => {
    const out = mergeCast([{ name: "Tài", isNarrator: true }], [{ name: "Hạnh" }]);
    expect(out.filter((c) => c.isNarrator).map((c) => c.name)).toEqual(["Tài"]);
  });

  it("dàn rỗng hoàn toàn thì trả về rỗng, không ném", () => {
    expect(mergeCast([], [])).toEqual([]);
  });

  it("không chọn ai thì y như cũ: chỉ có dàn model sinh", () => {
    expect(mergeCast([], generated).map((c) => c.name)).toEqual(["Tài", "Cô gái áo trắng"]);
  });
});

describe("namesMentionedIn — đoán ai có mặt trong beat", () => {
  const names = ["Tài", "ông Bảy", "Cô gái áo trắng"];

  it("bắt tên xuất hiện trong beat", () => {
    const out = namesMentionedIn("Tài quay lại Bến Cũ và gặp ông Bảy.", names);
    expect(out).toContain("Tài");
    expect(out).toContain("ông Bảy");
  });

  it("không phân biệt hoa thường", () => {
    expect(namesMentionedIn("TÀI dừng xe.", names)).toContain("Tài");
  });

  it("beat không nhắc ai thì trả về rỗng — cảnh giữ 'chưa biết'", () => {
    // Rỗng nghĩa là Bible nạp đầy đủ như cũ. Đoán hụt chỉ mất phần lọc, không
    // làm model viết cảnh mà thiếu mô tả người trong đó.
    expect(namesMentionedIn("Mưa suốt đêm ngoài quốc lộ.", names)).toEqual([]);
  });

  it("xét tên DÀI trước", () => {
    // Dàn có cả "ông Bảy" thì beat nhắc "ông Bảy" phải ra đúng người đó trước.
    const out = namesMentionedIn("ông Bảy gác bến.", ["Bảy", "ông Bảy"]);
    expect(out[0]).toBe("ông Bảy");
  });

  it("danh sách nhân vật rỗng thì không ném", () => {
    expect(namesMentionedIn("Tài dừng xe.", [])).toEqual([]);
  });
});
