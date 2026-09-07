import { describe, expect, it } from "vitest";
import { isEpisodeComplete, nextStep, type BatchOptions, type EpisodeProgress } from "./batch-plan";

const fresh: EpisodeProgress = {
  humanReviewed: false,
  hasDraft: false,
  needsTranslate: false,
  blocksTotal: 0,
  blocksWithAudio: 0,
  hasSummary: false,
  hasMp3: false,
};

const ep = (over: Partial<EpisodeProgress> = {}): EpisodeProgress => ({ ...fresh, ...over });

const manual: BatchOptions = { autoApprove: false, withAudio: true };
const auto: BatchOptions = { autoApprove: true, withAudio: true };
const noAudio: BatchOptions = { autoApprove: true, withAudio: false };

describe("the full step chain", () => {
  it("runs in the right order from an empty episode to an MP3", () => {
    const seen: string[] = [];
    let e = ep();

    for (let i = 0; i < 10; i++) {
      const s = nextStep(e, auto);
      if (s.kind === "done") break;
      seen.push(s.kind === "job" ? s.type : s.kind);

      // Simulate the outcome of each step.
      if (s.kind === "approve") e = { ...e, humanReviewed: true };
      else if (s.kind === "wait-review") throw new Error("autoApprove is on but it still asked for manual approval");
      else if (s.type === "WRITE_SCENE") e = { ...e, hasDraft: true };
      else if (s.type === "TRANSLATE") e = { ...e, needsTranslate: false };
      else if (s.type === "AUDIO_EDIT") e = { ...e, blocksTotal: 12 };
      else if (s.type === "SUMMARIZE") e = { ...e, hasSummary: true };
      else if (s.type === "TTS") e = { ...e, blocksWithAudio: e.blocksTotal };
      else if (s.type === "MIX") e = { ...e, hasMp3: true };
    }

    expect(seen).toEqual([
      "WRITE_SCENE",
      "approve",
      "AUDIO_EDIT",
      "SUMMARIZE",
      "TTS",
      "MIX",
    ]);
    expect(nextStep(e, auto)).toEqual({ kind: "done" });
  });
});

describe("the draft approval gate", () => {
  it("stops and waits for a reader when autoApprove is off", () => {
    expect(nextStep(ep({ hasDraft: true }), manual)).toEqual({ kind: "wait-review" });
  });

  it("NEVER skips the approval step while autoApprove is off", () => {
    // Even with everything else ready, unapproved means stop. This is the only gate
    // standing between a raw draft and audio.
    const e = ep({ hasDraft: true, blocksTotal: 5, hasSummary: true });
    expect(nextStep(e, manual)).toEqual({ kind: "wait-review" });
  });

  it("with autoApprove on it approves and carries on", () => {
    expect(nextStep(ep({ hasDraft: true }), auto)).toEqual({ kind: "approve" });
  });

  it("already approved by hand is not asked again", () => {
    expect(nextStep(ep({ hasDraft: true, humanReviewed: true }), manual)).toEqual({
      kind: "job",
      type: "AUDIO_EDIT",
    });
  });
});

describe("the rewrite step", () => {
  const drafted = ep({ hasDraft: true, needsTranslate: true });

  it("runs RIGHT AFTER writing, before the approval gate", () => {
    // Approving a draft in a language that never reaches the speakers makes the gate
    // meaningless: what the reader nodded at differs from what the listener receives.
    expect(nextStep(drafted, manual)).toEqual({ kind: "job", type: "TRANSLATE" });
    expect(nextStep(drafted, auto)).toEqual({ kind: "job", type: "TRANSLATE" });
  });

  it("autoApprove does NOT slip past it", () => {
    expect(nextStep(drafted, auto)).not.toEqual({ kind: "approve" });
  });

  it("unwritten scenes are written first", () => {
    expect(nextStep(ep({ needsTranslate: true }), auto)).toEqual({
      kind: "job",
      type: "WRITE_SCENE",
    });
  });

  it("approval comes only after the rewrite", () => {
    expect(nextStep(ep({ hasDraft: true, needsTranslate: false }), manual)).toEqual({
      kind: "wait-review",
    });
  });

  it("a story that writes directly never has this step in the chain", () => {
    // `needsTranslate` is always false for a story with no draft language — this step
    // must not slip into the old chain anywhere.
    const seen: string[] = [];
    let e = ep();
    for (let i = 0; i < 10; i++) {
      const s = nextStep(e, auto);
      if (s.kind === "done") break;
      seen.push(s.kind === "job" ? s.type : s.kind);
      if (s.kind === "approve") e = { ...e, humanReviewed: true };
      else if (s.kind === "job" && s.type === "WRITE_SCENE") e = { ...e, hasDraft: true };
      else if (s.kind === "job" && s.type === "AUDIO_EDIT") e = { ...e, blocksTotal: 4 };
      else if (s.kind === "job" && s.type === "SUMMARIZE") e = { ...e, hasSummary: true };
      else if (s.kind === "job" && s.type === "TTS") e = { ...e, blocksWithAudio: e.blocksTotal };
      else if (s.kind === "job" && s.type === "MIX") e = { ...e, hasMp3: true };
    }
    expect(seen).not.toContain("TRANSLATE");
  });

  it("an episode with scenes still un-rewritten is NOT done, however much audio it has", () => {
    // Rewriting one scene midway nulls `sourceText`; the run has to go back to the
    // rewrite rather than treating the episode as closed.
    const e = ep({
      hasDraft: true,
      humanReviewed: true,
      needsTranslate: true,
      blocksTotal: 6,
      blocksWithAudio: 6,
      hasSummary: true,
      hasMp3: true,
    });
    expect(isEpisodeComplete(e, auto)).toBe(false);
  });
});

describe("withAudio", () => {
  const scripted = ep({ hasDraft: true, humanReviewed: true, blocksTotal: 8, hasSummary: true });

  it("off, it stops after the summary and never runs TTS", () => {
    expect(nextStep(scripted, noAudio)).toEqual({ kind: "done" });
    expect(isEpisodeComplete(scripted, noAudio)).toBe(true);
  });

  it("on, it carries on into TTS", () => {
    expect(nextStep(scripted, auto)).toEqual({ kind: "job", type: "TTS" });
    expect(isEpisodeComplete(scripted, auto)).toBe(false);
  });
});

describe("a partial TTS run", () => {
  const base = { hasDraft: true, humanReviewed: true, hasSummary: true, blocksTotal: 10 };

  it("blocks still without audio mean TTS runs again", () => {
    expect(nextStep(ep({ ...base, blocksWithAudio: 7 }), auto)).toEqual({
      kind: "job",
      type: "TTS",
    });
  });

  it("with all the audio it moves to MIX", () => {
    expect(nextStep(ep({ ...base, blocksWithAudio: 10 }), auto)).toEqual({
      kind: "job",
      type: "MIX",
    });
  });

  it("with an MP3 it is done", () => {
    expect(nextStep(ep({ ...base, blocksWithAudio: 10, hasMp3: true }), auto)).toEqual({
      kind: "done",
    });
  });
});

describe("judged on data, not on status", () => {
  it("a script with no summary summarises rather than rewriting the scenes", () => {
    // A real situation: the user ran AUDIO_EDIT by hand in Studio and only then started
    // a batch run. It must not overwrite the draft that already exists.
    const e = ep({ hasDraft: true, humanReviewed: true, blocksTotal: 20 });
    expect(nextStep(e, auto)).toEqual({ kind: "job", type: "SUMMARIZE" });
  });

  it("a fully finished episode is skipped", () => {
    const e = ep({
      hasDraft: true,
      humanReviewed: true,
      blocksTotal: 6,
      blocksWithAudio: 6,
      hasSummary: true,
      hasMp3: true,
    });
    expect(isEpisodeComplete(e, auto)).toBe(true);
    expect(isEpisodeComplete(e, manual)).toBe(true);
  });

  it("an episode with no blocks is NOT treated as done", () => {
    // blocksWithAudio >= blocksTotal is also true when both are 0 — comparing only those
    // two numbers would read an episode with no blocks yet as fully read.
    const e = ep({ hasDraft: true, humanReviewed: true, hasSummary: true });
    expect(nextStep(e, auto)).toEqual({ kind: "job", type: "AUDIO_EDIT" });
  });
});
