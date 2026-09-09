import { describe, expect, it } from "vitest";
import { JobType, PROMPT_STEPS, PromptStep, isJobType, isPromptStep } from "./catalogue";

describe("the catalogues", () => {
  it("every key maps to itself, so a value IS its name", () => {
    // Rows hold the label as text. A key and value that disagreed would write one
    // string and look one up by another, and nothing would say so.
    for (const [k, v] of Object.entries(JobType)) expect(v).toBe(k);
    for (const [k, v] of Object.entries(PromptStep)) expect(v).toBe(k);
  });

  it("every prompt step is also a job type, except the ones nothing queues", () => {
    // STORY_SO_FAR runs inside WRITE_SCENE and SCENE_BEAT is queued as its own job;
    // this pins which steps have a job behind them, so a new step cannot quietly
    // arrive with no way to run it.
    const withoutJobs = PROMPT_STEPS.filter((s) => !(s in JobType));
    expect(withoutJobs).toEqual(["STORY_SO_FAR"]);
  });
});

describe("isPromptStep / isJobType", () => {
  it("accepts what the code has", () => {
    expect(isPromptStep("WRITE_SCENE")).toBe(true);
    expect(isJobType("MIX")).toBe(true);
  });

  it("rejects a step the code dropped", () => {
    // ARC_SUMMARY was removed. A Prompt row or a RenderJob still naming it is history,
    // and the guards are what stop it being treated as live.
    expect(isPromptStep("ARC_SUMMARY")).toBe(false);
    expect(isJobType("ARC_SUMMARY")).toBe(false);
  });

  it("rejects a typo, which the enum column used to do", () => {
    expect(isPromptStep("WRITE_SCENEE")).toBe(false);
    expect(isPromptStep("")).toBe(false);
  });

  it("is not fooled by inherited object properties", () => {
    // `value in PromptStep` walks the prototype chain, so "toString" would pass a
    // careless implementation and create a prompt row nothing ever loads.
    expect(isPromptStep("toString")).toBe(false);
    expect(isJobType("constructor")).toBe(false);
  });
});
