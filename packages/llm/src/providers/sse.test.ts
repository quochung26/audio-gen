import { describe, expect, it } from "vitest";
import { readChatChunk, takeSseEvents } from "./sse";

describe("takeSseEvents", () => {
  it("tách sự kiện hoàn chỉnh", () => {
    const r = takeSseEvents('data: {"a":1}\ndata: {"a":2}\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }, { a: 2 }]);
    expect(r.rest).toBe("");
  });

  it("GIỮ dòng dở làm phần dư", () => {
    // Khối dữ liệu từ mạng cắt ngang giữa JSON là chuyện thường ở câu trả lời dài.
    const r = takeSseEvents('data: {"a":1}\ndata: {"b');
    expect(r.events).toHaveLength(1);
    expect(r.rest).toBe('data: {"b');
  });

  it("nối được phần dư với khối sau", () => {
    const first = takeSseEvents('data: {"a":1}\ndata: {"b');
    const second = takeSseEvents(first.rest + '":2}\n');
    expect(second.events[0]?.data).toEqual({ b: 2 });
  });

  it("nhận dòng [DONE]", () => {
    const r = takeSseEvents("data: [DONE]\n");
    expect(r.events).toEqual([{ data: null, done: true }]);
  });

  it("bỏ qua dòng giữ kết nối của OpenRouter", () => {
    // OpenRouter gửi ": OPENROUTER PROCESSING" định kỳ để proxy không cắt.
    const r = takeSseEvents(': OPENROUTER PROCESSING\ndata: {"a":1}\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }]);
  });

  it("bỏ qua dòng trống và JSON hỏng", () => {
    const r = takeSseEvents('\ndata: rác\ndata: {"a":1}\n\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }]);
  });

  it("bỏ qua dòng không phải data:", () => {
    const r = takeSseEvents('event: message\ndata: {"a":1}\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }]);
  });
});

describe("readChatChunk", () => {
  it("lấy mẩu chữ", () => {
    expect(readChatChunk({ choices: [{ delta: { content: "Đêm" } }] }).content).toBe("Đêm");
  });

  it("chunk không có chữ thì trả chuỗi rỗng, không phải undefined", () => {
    expect(readChatChunk({ choices: [{ delta: {} }] }).content).toBe("");
    expect(readChatChunk({}).content).toBe("");
  });

  it("lấy số token từ chunk cuối", () => {
    const r = readChatChunk({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 340 } });
    expect(r).toMatchObject({ inputTokens: 120, outputTokens: 340 });
  });

  it("bắt được lý do dừng — 'length' nghĩa là bị cắt", () => {
    // Phân biệt được "model viết xong" với "hết trần token" mới biết vì sao
    // cảnh cụt lủn.
    expect(readChatChunk({ choices: [{ finish_reason: "length" }] }).finishReason).toBe("length");
    expect(readChatChunk({ choices: [{ finish_reason: "stop" }] }).finishReason).toBe("stop");
    expect(readChatChunk({ choices: [{ delta: { content: "x" } }] }).finishReason).toBeNull();
  });
});
