import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPromptVariables, pickPrompt, PROMPT_VARIABLES, renderTemplate } from "./prompt";

describe("renderTemplate", () => {
  it("substitutes variables", () => {
    expect(renderTemplate("Hello {{name}}, {{n}} episodes", { name: "Tài", n: 3 })).toBe(
      "Hello Tài, 3 episodes",
    );
  });

  it("a missing variable THROWS, rather than blanking silently", () => {
    // A deliberate choice: a prompt missing a context block still gets normal-looking
    // prose back, and the mistake only shows up as quality.
    expect(() => renderTemplate("{{a}} and {{b}}", { a: "x" })).toThrow(/missing variables: b/);
  });

  it("lists every missing variable, not just the first", () => {
    expect(() => renderTemplate("{{a}}{{b}}{{c}}", {})).toThrow(/a, b, c/);
  });

  it("an empty string is a valid value, different from missing", () => {
    expect(renderTemplate("[{{a}}]", { a: "" })).toBe("[]");
  });

  it("leaves anything that is not variable syntax alone", () => {
    expect(renderTemplate("{ a } {{{b}}} }}", { b: "x" })).toBe("{ a } {x} }}");
  });
});

describe("checkPromptVariables", () => {
  it("catches a variable the step does not pass", () => {
    const r = checkPromptVariables("SUMMARIZE", "{{text}} {{khongCo}}");
    expect(r.unknown).toEqual(["khongCo"]);
  });

  it("reports a variable that goes unused", () => {
    const r = checkPromptVariables("SUMMARIZE", "{{text}}");
    expect(r.unused).toEqual(["characters"]);
    expect(r.unknown).toEqual([]);
  });

  it("a prompt using every variable is clean both ways", () => {
    const r = checkPromptVariables("AUDIO_EDIT", "{{characters}}\n{{draft}}");
    expect(r).toMatchObject({ unknown: [], unused: [] });
  });

  it("does not double-count a variable appearing several times", () => {
    expect(checkPromptVariables("SUMMARIZE", "{{text}} {{text}}").used).toEqual(["text"]);
  });
});

describe("the default prompts in the repo", () => {
  const FILES: Array<[Parameters<typeof checkPromptVariables>[0], string]> = [
    ["OUTLINE", "outline.md"],
    ["STORY_SO_FAR", "story-so-far.md"],
    ["CHARACTER", "character.md"],
    ["NEXT_EPISODE", "next-episode.md"],
    ["NEXT_CHAPTER", "next-chapter.md"],
    ["SCENE_BEAT", "scene-beat.md"],
    ["SCENE_CONTEXT", "scene-context.md"],
    ["WRITE_SCENE", "write-scene.md"],
    ["TRANSLATE", "translate.md"],
    ["AUDIO_EDIT", "audio-edit.md"],
    ["SUMMARIZE", "summarize.md"],
    ["METADATA", "metadata.md"],
  ];

  it.each(FILES)("%s uses only the variables that step passes in", async (step, file) => {
    // Locks PROMPT_VARIABLES and the real prompts together: one mismatched name kills
    // the job at run time, not at build time.
    const content = await readFile(join(import.meta.dirname, "../../../prompts", file), "utf8");
    expect(checkPromptVariables(step, content).unknown).toEqual([]);
  });

  it("declares all 12 steps", () => {
    expect(Object.keys(PROMPT_VARIABLES).sort()).toEqual(FILES.map(([s]) => s).sort());
  });
});

describe("pickPrompt", () => {
  const p = (genre: string, version: number) => ({ genre, version });

  it("a genre variant beats the default", () => {
    expect(pickPrompt([p("*", 3), p("kinh dị", 1)], "kinh dị")).toEqual(p("kinh dị", 1));
  });

  it("the genre wins EVEN WHEN the default has a higher version", () => {
    // Sorting by version before considering genre would break this rule.
    expect(pickPrompt([p("*", 99), p("kinh dị", 1)], "kinh dị")).toEqual(p("kinh dị", 1));
  });

  it("within one genre, the higher version wins", () => {
    expect(pickPrompt([p("kinh dị", 1), p("kinh dị", 3), p("kinh dị", 2)], "kinh dị")).toEqual(
      p("kinh dị", 3),
    );
  });

  it("a genre with no variant falls back to the default", () => {
    expect(pickPrompt([p("*", 2), p("trinh thám", 1)], "kinh dị")).toEqual(p("*", 2));
  });

  it("with no genre given it uses the default", () => {
    expect(pickPrompt([p("*", 2), p("kinh dị", 5)])).toEqual(p("*", 2));
  });

  it("with nothing usable it returns undefined", () => {
    expect(pickPrompt([p("trinh thám", 1)], "kinh dị")).toBeUndefined();
    expect(pickPrompt([])).toBeUndefined();
  });
});

describe("the NEXT_EPISODE step's variables", () => {
  it("does NOT take the new-story step's variables", () => {
    // Continuing has no "original idea" to pass in.
    expect(checkPromptVariables("NEXT_EPISODE", "{{idea}}").unknown).toEqual(["idea"]);
  });
});
