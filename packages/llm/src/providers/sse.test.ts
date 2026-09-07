import { describe, expect, it } from "vitest";
import { readChatChunk, takeSseEvents } from "./sse";

describe("takeSseEvents", () => {
  it("splits out complete events", () => {
    const r = takeSseEvents('data: {"a":1}\ndata: {"a":2}\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }, { a: 2 }]);
    expect(r.rest).toBe("");
  });

  it("KEEPS a partial line as the remainder", () => {
    // A network chunk cutting through JSON is normal in a long reply.
    const r = takeSseEvents('data: {"a":1}\ndata: {"b');
    expect(r.events).toHaveLength(1);
    expect(r.rest).toBe('data: {"b');
  });

  it("joins the remainder to the next chunk", () => {
    const first = takeSseEvents('data: {"a":1}\ndata: {"b');
    const second = takeSseEvents(first.rest + '":2}\n');
    expect(second.events[0]?.data).toEqual({ b: 2 });
  });

  it("recognises the [DONE] line", () => {
    const r = takeSseEvents("data: [DONE]\n");
    expect(r.events).toEqual([{ data: null, done: true }]);
  });

  it("skips OpenRouter's keep-alive lines", () => {
    // OpenRouter sends ": OPENROUTER PROCESSING" periodically so proxies do not cut it.
    const r = takeSseEvents(': OPENROUTER PROCESSING\ndata: {"a":1}\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }]);
  });

  it("skips blank lines and malformed JSON", () => {
    const r = takeSseEvents('\ndata: junk\ndata: {"a":1}\n\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }]);
  });

  it("skips lines that are not data:", () => {
    const r = takeSseEvents('event: message\ndata: {"a":1}\n');
    expect(r.events.map((e) => e.data)).toEqual([{ a: 1 }]);
  });
});

describe("readChatChunk", () => {
  it("takes the text fragment", () => {
    expect(readChatChunk({ choices: [{ delta: { content: "Đêm" } }] }).content).toBe("Đêm");
  });

  it("a chunk with no text returns an empty string, not undefined", () => {
    expect(readChatChunk({ choices: [{ delta: {} }] }).content).toBe("");
    expect(readChatChunk({}).content).toBe("");
  });

  it("takes the token counts from the final chunk", () => {
    const r = readChatChunk({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 340 } });
    expect(r).toMatchObject({ inputTokens: 120, outputTokens: 340 });
  });

  it("catches the stop reason — 'length' means it was cut off", () => {
    // Telling "the model finished" from "it hit the token ceiling" is the only way to
    // know why a scene stops short.
    expect(readChatChunk({ choices: [{ finish_reason: "length" }] }).finishReason).toBe("length");
    expect(readChatChunk({ choices: [{ finish_reason: "stop" }] }).finishReason).toBe("stop");
    expect(readChatChunk({ choices: [{ delta: { content: "x" } }] }).finishReason).toBeNull();
  });
});
