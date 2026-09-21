import { describe, expect, it } from "vitest";
import { directionLabel, renderCourse, storyCourseSchema, type StoryCourse } from "./course";

const base: StoryCourse = {
  onCourse: false,
  where: "The story has turned into a hunt, where it set out to be a haunting.",
  drifted: [{ field: "corePromise", how: "Recent episodes pay off a chase, not a debt." }],
  midpointReached: false,
  remaining: "about halfway",
  next: "Let the next episode pay one old debt before the chase resumes.",
};

describe("the course schema", () => {
  it("accepts a story that is on course with nothing drifted", () => {
    const clean = { ...base, onCourse: true, drifted: [] };
    expect(storyCourseSchema.safeParse(clean).success).toBe(true);
  });

  it("refuses a disagreement with no explanation", () => {
    const bad = { ...base, drifted: [{ field: "corePromise", how: "" }] };
    expect(storyCourseSchema.safeParse(bad).success).toBe(false);
  });

  it("only knows the five parts of a direction", () => {
    const bad = { ...base, drifted: [{ field: "vibes", how: "x" }] };
    expect(storyCourseSchema.safeParse(bad).success).toBe(false);
  });
});

describe("renderCourse", () => {
  it("says which episode it was checked after", () => {
    expect(renderCourse(base, 12)).toContain("Checked after episode 12");
  });

  // A story that bent away from its stated ending is often the one that is right: the
  // writer found something better and never edited the paragraph.
  it("does not tell the planner to force the story back", () => {
    const t = renderCourse(base, 12);
    expect(t).toContain("the story may be the one that is right");
    expect(t).toContain("do not force it back");
  });

  it("answers the mid-point question either way", () => {
    expect(renderCourse(base, 12)).toContain("has NOT happened yet");
    expect(renderCourse({ ...base, midpointReached: true }, 12)).toContain(
      "already made its mid-point turn",
    );
  });

  it("names a drifted field the way the page and the Bible name it", () => {
    expect(renderCourse(base, 12)).toContain("What it promises every episode");
    expect(directionLabel("midpointTurn")).toBe("When it changes gear");
  });

  it("leaves the disagreement block out when there is none", () => {
    const t = renderCourse({ ...base, onCourse: true, drifted: [] }, 12);
    expect(t).not.toContain("disagree");
  });

  // Never asked, or asked for a story with no direction.
  it("says nothing at all when nobody has checked", () => {
    expect(renderCourse(null, 0)).toBe("");
  });
});
