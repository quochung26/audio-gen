import { describe, expect, it } from "vitest";
import {
  isValidModelTag,
  newPullProgress,
  reducePull,
  takeLines,
  type PullChunk,
} from "./ollama";

describe("takeLines", () => {
  it("splits out the complete lines", () => {
    const r = takeLines('{"status":"a"}\n{"status":"b"}\n');
    expect(r.chunks).toEqual([{ status: "a" }, { status: "b" }]);
    expect(r.rest).toBe("");
  });

  it("KEEPS a partial line as the remainder", () => {
    // A network chunk cutting through JSON is normal; parsing it now is an error.
    const r = takeLines('{"status":"a"}\n{"sta');
    expect(r.chunks).toEqual([{ status: "a" }]);
    expect(r.rest).toBe('{"sta');
  });

  it("joins the remainder to the next chunk", () => {
    const first = takeLines('{"status":"a"}\n{"sta');
    const second = takeLines(first.rest + 'tus":"b"}\n');
    expect(second.chunks).toEqual([{ status: "b" }]);
  });

  it("skips a broken line rather than killing the pull", () => {
    const r = takeLines('{"status":"a"}\ngarbage\n{"status":"b"}\n');
    expect(r.chunks).toEqual([{ status: "a" }, { status: "b" }]);
  });

  it("skips blank lines", () => {
    expect(takeLines('\n\n{"status":"a"}\n\n').chunks).toEqual([{ status: "a" }]);
  });
});

describe("reducePull", () => {
  const start = () => ({ p: newPullProgress("qwen3:14b"), layers: new Map<string, { completed: number; total: number }>() });

  it("sums progress PER LAYER, no jumping backwards at a new layer", () => {
    // Ollama restarts `completed` at 0 for each layer. Adding it straight up makes
    // the bar drop at every new layer — it looks like the download broke.
    const { p, layers } = start();
    let s = reducePull(p, { status: "downloading", digest: "L1", total: 100, completed: 100 }, layers);
    expect(s.completedBytes).toBe(100);

    s = reducePull(s, { status: "downloading", digest: "L2", total: 200, completed: 10 }, layers);
    expect(s.completedBytes).toBe(110); // NOT 10
    expect(s.totalBytes).toBe(300);
  });

  it("a second update for the same layer REPLACES, does not add", () => {
    const { p, layers } = start();
    let s = reducePull(p, { digest: "L1", total: 100, completed: 30 }, layers);
    s = reducePull(s, { digest: "L1", total: 100, completed: 60 }, layers);
    expect(s.completedBytes).toBe(60);
    expect(s.totalBytes).toBe(100);
  });

  it('a "success" line marks it done', () => {
    const { p, layers } = start();
    const s = reducePull(p, { status: "success" }, layers);
    expect(s.done).toBe(true);
    expect(s.finishedAt).not.toBeNull();
  });

  it("an error stops it and keeps the message verbatim", () => {
    const { p, layers } = start();
    const s = reducePull(p, { error: "model not found" }, layers);
    expect(s).toMatchObject({ done: true, error: "model not found" });
  });

  it("a line without a digest only changes status, leaves the byte count alone", () => {
    const { p, layers } = start();
    let s = reducePull(p, { digest: "L1", total: 100, completed: 50 }, layers);
    s = reducePull(s, { status: "verifying sha256 digest" }, layers);
    expect(s.status).toBe("verifying sha256 digest");
    expect(s.completedBytes).toBe(50);
  });

  it("a real progress sequence runs from 0 to done", () => {
    const { p, layers } = start();
    const stream: PullChunk[] = [
      { status: "pulling manifest" },
      { status: "downloading", digest: "sha256:a", total: 1000, completed: 0 },
      { status: "downloading", digest: "sha256:a", total: 1000, completed: 1000 },
      { status: "downloading", digest: "sha256:b", total: 500, completed: 500 },
      { status: "verifying sha256 digest" },
      { status: "success" },
    ];
    let s = p;
    for (const c of stream) s = reducePull(s, c, layers);
    expect(s.completedBytes).toBe(1500);
    expect(s.totalBytes).toBe(1500);
    expect(s.done).toBe(true);
    expect(s.error).toBeNull();
  });
});

describe("isValidModelTag", () => {
  it.each(["qwen3", "qwen3:14b", "qwen3:14b-q4_K_M", "library/qwen3:8b", "bge-m3:latest"])(
    "accepts %s",
    (tag) => expect(isValidModelTag(tag)).toBe(true),
  );

  it.each([
    ["empty", ""],
    ["contains whitespace", "qwen3 14b"],
    ["path traversal", "../../etc/passwd"],
    ["command injection", "qwen3;rm -rf /"],
    ["starts with punctuation", "-qwen3"],
    ["far too long", "a".repeat(129)],
  ])("rejects %s", (_name, tag) => expect(isValidModelTag(tag)).toBe(false));
});

describe("model names pulled from Hugging Face", () => {
  it("accepts the hf.co/<repo>:<quantisation> form", () => {
    // Tighten this rule and the Hugging Face "Download" button breaks with no
    // other test catching it.
    expect(isValidModelTag("hf.co/bartowski/Qwen2.5-14B-Instruct-GGUF:Q4_K_M")).toBe(true);
    expect(isValidModelTag("hf.co/a/b:q4_k_m")).toBe(true);
  });
});
