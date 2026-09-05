import { describe, expect, it } from "vitest";
import { MAX_TAGS, checkTags, parseTags, renderTags } from "./tags";

describe("parseTags", () => {
  it("tách theo dấu phẩy và bỏ khoảng trắng thừa", () => {
    expect(parseTags(" romance , action ,slow burn ")).toEqual(["romance", "action", "slow burn"]);
  });

  it("gộp khoảng trắng bên trong tag", () => {
    // "slow   burn" và "slow burn" là một; để cả hai vào Bible thì model tưởng
    // đó là hai định hướng khác nhau.
    expect(parseTags("slow   burn, slow burn")).toEqual(["slow burn"]);
  });

  it("khử trùng KHÔNG phân biệt hoa thường, giữ dạng gõ đầu tiên", () => {
    expect(parseTags("Romance, romance, ROMANCE")).toEqual(["Romance"]);
  });

  it("bỏ mục rỗng", () => {
    expect(parseTags("a,,  ,b")).toEqual(["a", "b"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(" , , ")).toEqual([]);
  });

  it("cắt ở giới hạn số tag", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    expect(parseTags(many)).toHaveLength(MAX_TAGS);
  });

  it("bỏ tag dài bất thường", () => {
    expect(parseTags(`ok, ${"x".repeat(200)}`)).toEqual(["ok"]);
  });

  it("giữ được tag tiếng Việt có dấu", () => {
    expect(parseTags("kinh dị tâm lý, đô thị")).toEqual(["kinh dị tâm lý", "đô thị"]);
  });
});

describe("checkTags", () => {
  it("chuỗi bình thường thì không có lỗi", () => {
    expect(checkTags("romance, action")).toEqual([]);
  });

  it("báo tag quá dài", () => {
    expect(checkTags("x".repeat(200))[0]).toMatch(/quá dài/);
  });

  it("báo quá nhiều tag", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    expect(checkTags(many)[0]).toMatch(/Nhiều nhất/);
  });

  it("tag quá dài KHÔNG kéo theo lời than 'quá nhiều tag'", () => {
    // Một sai sót thì báo một lỗi. Đếm cả tag đã bị loại vì quá dài thì người
    // dùng nhận hai lỗi, mà lỗi thứ hai còn sai.
    const e = checkTags("x".repeat(200));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/quá dài/);
  });

  it("vừa dài vừa nhiều thì báo cả hai", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    const e = checkTags(`${"x".repeat(200)},${many}`);
    expect(e).toHaveLength(2);
  });

  it("trùng nhau KHÔNG tính là quá nhiều", () => {
    // 30 lần cùng một chữ chỉ còn 1 tag sau khi khử trùng.
    const dup = Array.from({ length: 30 }, () => "romance").join(",");
    expect(checkTags(dup)).toEqual([]);
  });
});

describe("renderTags", () => {
  it("nói rõ là thứ phải BÁM THEO, không phải nhãn phân loại", () => {
    // Liệt kê trần thì model coi là metadata rồi bỏ qua, văn ra y hệt như
    // không đặt gì.
    const line = renderTags(["tình cảm", "hành động"])!;
    expect(line).toContain("tình cảm, hành động");
    expect(line).toMatch(/must follow these too/);
  });

  it("không có tag thì trả null, để Bible khỏi thừa một dòng trống", () => {
    expect(renderTags([])).toBeNull();
  });
});
