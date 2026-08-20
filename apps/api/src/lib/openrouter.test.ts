import { describe, expect, it } from "vitest";
import {
  averagePerEpisode,
  isValidOpenRouterModel,
  parseKeyStatus,
  parseModelList,
  pricePerMTok,
  toModelInfo,
} from "./openrouter";

describe("pricePerMTok", () => {
  it("đổi USD/token sang USD/triệu token", () => {
    // 0.000003 USD/token = 3 USD cho 1 triệu token.
    expect(pricePerMTok("0.000003")).toBeCloseTo(3, 6);
  });

  it("giá 0 là 0 chứ KHÔNG phải 'không có giá'", () => {
    // Nhầm hai cái này là model miễn phí hiện thành "chưa rõ giá".
    expect(pricePerMTok("0")).toBe(0);
  });

  it("thiếu hoặc hỏng thì trả null", () => {
    expect(pricePerMTok(undefined)).toBeNull();
    expect(pricePerMTok("")).toBeNull();
    expect(pricePerMTok("miễn phí")).toBeNull();
    expect(pricePerMTok("-1")).toBeNull();
  });
});

describe("toModelInfo", () => {
  it("rút gọn một model", () => {
    expect(
      toModelInfo({
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        context_length: 200000,
        pricing: { prompt: "0.000003", completion: "0.000015" },
      }),
    ).toEqual({
      id: "anthropic/claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      contextLength: 200000,
      promptPerMTok: 3,
      completionPerMTok: 15,
      free: false,
    });
  });

  it("chỉ gọi là miễn phí khi CẢ HAI đầu đều 0", () => {
    const halfFree = toModelInfo({ id: "a/b", pricing: { prompt: "0", completion: "0.000002" } });
    expect(halfFree?.free).toBe(false);

    const free = toModelInfo({ id: "a/b:free", pricing: { prompt: "0", completion: "0" } });
    expect(free?.free).toBe(true);
  });

  it("giá không rõ thì không phải miễn phí", () => {
    expect(toModelInfo({ id: "a/b" })?.free).toBe(false);
  });

  it("thiếu id thì bỏ", () => {
    expect(toModelInfo({ name: "vô danh" })).toBeNull();
  });

  it("thiếu tên thì lấy id làm tên", () => {
    expect(toModelInfo({ id: "a/b" })?.name).toBe("a/b");
  });
});

describe("parseModelList", () => {
  it("sắp xếp theo id và bỏ mục hỏng", () => {
    const list = parseModelList({ data: [{ id: "z/b" }, { name: "hỏng" }, { id: "a/b" }] });
    expect(list.map((m) => m.id)).toEqual(["a/b", "z/b"]);
  });

  it("thân lạ thì trả mảng rỗng, không ném lỗi", () => {
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList({})).toEqual([]);
    expect(parseModelList({ data: "không phải mảng" })).toEqual([]);
  });
});

describe("parseKeyStatus", () => {
  it("khoá có hạn mức", () => {
    expect(
      parseKeyStatus({ data: { usage: 2.5, limit: 10, limit_remaining: 7.5, is_free_tier: false } }),
    ).toEqual({ usage: 2.5, limit: 10, remaining: 7.5, freeTier: false });
  });

  it("tài khoản trả trước không có hạn mức thì remaining là null, KHÔNG phải NaN", () => {
    // Tự tính `limit - usage` khi limit vắng mặt là ra NaN, rồi hiện "còn $NaN".
    const s = parseKeyStatus({ data: { usage: 2.5, limit: null } });
    expect(s.limit).toBeNull();
    expect(s.remaining).toBeNull();
  });

  it("thiếu limit_remaining thì tự tính từ limit", () => {
    expect(parseKeyStatus({ data: { usage: 3, limit: 10 } }).remaining).toBe(7);
  });

  it("thân rỗng không làm chết", () => {
    expect(parseKeyStatus(null)).toEqual({ usage: 0, limit: null, remaining: null, freeTier: false });
  });
});

describe("isValidOpenRouterModel", () => {
  it("nhận tên thật", () => {
    expect(isValidOpenRouterModel("anthropic/claude-sonnet-4.5")).toBe(true);
    expect(isValidOpenRouterModel("meta-llama/llama-3.3-70b-instruct:free")).toBe(true);
    expect(isValidOpenRouterModel("openai/gpt-5")).toBe(true);
  });

  it("từ chối tên thiếu nhà cung cấp", () => {
    expect(isValidOpenRouterModel("qwen3:14b")).toBe(false);
  });

  it("chặn ký tự có thể chui ra khỏi đường dẫn", () => {
    expect(isValidOpenRouterModel("../../etc/passwd")).toBe(false);
    expect(isValidOpenRouterModel("a/b c")).toBe(false);
    expect(isValidOpenRouterModel("a/b?x=1")).toBe(false);
    expect(isValidOpenRouterModel("a/b/c")).toBe(false);
    expect(isValidOpenRouterModel("")).toBe(false);
  });

  it("chặn tên dài bất thường", () => {
    expect(isValidOpenRouterModel(`a/${"b".repeat(200)}`)).toBe(false);
  });
});

describe("averagePerEpisode", () => {
  it("cộng theo TẬP trước rồi mới lấy trung bình", () => {
    // Tập A gọi model 3 lần, tập B gọi 1 lần. Trung bình phải là trung bình của
    // (300, 30) và (100, 10) — tức 200/20 — chứ không phải trung bình của bốn
    // lượt gọi (150/15), vốn là giá của một CẢNH chứ không phải một TẬP.
    const rows = [
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
      { episodeId: "B", inputTokens: 100, outputTokens: 10 },
    ];
    expect(averagePerEpisode(rows)).toEqual({ episodes: 2, inputTokens: 200, outputTokens: 20 });
  });

  it("bỏ qua lượt chạy không gắn với tập nào", () => {
    const r = averagePerEpisode([
      { episodeId: null, inputTokens: 9999, outputTokens: 9999 },
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
    ]);
    expect(r).toEqual({ episodes: 1, inputTokens: 100, outputTokens: 10 });
  });

  it("chưa có dữ liệu thì trả null, KHÔNG phải số 0", () => {
    // Hiện "0 đồng một tập" còn tệ hơn không hiện gì.
    expect(averagePerEpisode([])).toBeNull();
    expect(averagePerEpisode([{ episodeId: null, inputTokens: 5, outputTokens: 5 }])).toBeNull();
  });
});
