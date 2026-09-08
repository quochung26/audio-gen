import { describe, expect, it } from "vitest";
import { EMPTY_WORLD, renderBible } from "./world";
import { buildBible, seriesBible } from "./story-context";

const base = {
  title: "Đường về",
  genre: "kinh dị",
  world: EMPTY_WORLD,
  characters: [{ name: "Hùng", isNarrator: true }],
};

describe("the Story Bible carries the sub-genre tags", () => {
  it("sits RIGHT UNDER the main genre — where the model reads first", () => {
    // This is what steers the prose; buried at the end of the Bible it drowns in
    // thousands of words of world rules and character descriptions.
    const b = renderBible({ ...base, tags: ["tình cảm", "slow burn"], logline: "one line" });
    expect(b).toContain("tình cảm, slow burn");
    expect(b.indexOf("Genre:")).toBeLessThan(b.indexOf("tình cảm"));
    expect(b.indexOf("tình cảm")).toBeLessThan(b.indexOf("Logline"));
  });

  it("without them the Bible is unchanged", () => {
    expect(renderBible({ ...base, tags: [] })).toBe(renderBible(base));
  });

  it("the MAIN genre still stands alone, not blended in", () => {
    // The main one keys prompt selection; blended, it cannot be told apart.
    const b = renderBible({ ...base, tags: ["tình cảm"] });
    expect(b).toContain("Genre: kinh dị");
  });
});

describe("seriesBible — building the Bible from a Series record", () => {
  const series = {
    title: "Đường về",
    genre: "kinh dị",
    tags: ["tình cảm", "slow burn"],
    description: "A story.",
    world: EMPTY_WORLD,
    genreNotes: [],
    characters: [{ name: "Hùng", isNarrator: true, description: "tài xế", state: null }],
  };

  it("CARRIES the sub-genre tags", () => {
    // This is the only line delivering sub-genres to the model at scene-writing
    // time. Before it was gathered in one place, deleting it turned no test red.
    expect(seriesBible(series)).toContain("tình cảm, slow burn");
  });

  it("folds the current state into the character description", () => {
    // What keeps episode 40 from walking a character who died in episode 12 into a scene.
    const b = seriesBible({
      ...series,
      characters: [{ name: "Hùng", isNarrator: true, description: "tài xế", state: "đã chết" }],
    });
    expect(b).toContain("Current state: đã chết");
    expect(b).toContain("tài xế");
  });

  it("speech and appearance get THEIR OWN LABELS, not folded into the personality line", () => {
    // Three different jobs: personality steers action, speech steers dialogue,
    // appearance steers description. Merged, the model describes clothing in the
    // middle of a passage that needed a voice.
    const b = seriesBible({
      ...series,
      characters: [
        {
          name: "Hùng",
          isNarrator: true,
          description: "lì",
          speech: "cộc lốc",
          appearance: "gầy, da sạm",
          outfit: "áo sơ mi bạc màu",
          state: null,
        },
      ],
    });
    expect(b).toContain("Speech: cộc lốc");
    expect(b).toContain("Appearance: gầy, da sạm");
    expect(b.indexOf("lì")).toBeLessThan(b.indexOf("Speech:"));
    expect(b.indexOf("Speech:")).toBeLessThan(b.indexOf("Appearance:"));
    // The outfit is a DEFAULT, placed after appearance — chapter and scene override it.
    expect(b).toContain("Usually wears: áo sơ mi bạc màu");
    expect(b.indexOf("Appearance:")).toBeLessThan(b.indexOf("Usually wears:"));
  });

  it("a character with neither description nor state produces no empty line", () => {
    const b = seriesBible({
      ...series,
      characters: [{ name: "Hùng", isNarrator: true, description: null, state: null }],
    });
    expect(b).toContain("Hùng");
    expect(b).not.toContain("Current state:");
    expect(b).not.toContain("Speech:");
    expect(b).not.toContain("Appearance:");
    expect(b).not.toContain("Usually wears:");
  });

  it("turns the story description into the logline", () => {
    expect(seriesBible(series)).toContain("A story.");
    expect(seriesBible({ ...series, description: null })).not.toContain("Logline:");
  });
});

describe("genre descriptions in the Bible", () => {
  const notes = [
    { name: "tình cảm", description: "A relationship shifting between two people." },
    { name: "kinh dị", description: "Fear that comes from the unexplained." },
  ];
  const base = {
    title: "Đường về",
    genre: "kinh dị",
    tags: ["tình cảm"],
    world: EMPTY_WORLD,
    genreNotes: [],
    characters: [{ name: "Hùng", isNarrator: true }],
  };

  it("the MAIN genre comes first, whatever order the query returned", () => {
    // The model reads in sequence; a sub-genre first inverts the priority.
    const b = seriesBible({ ...base, genreNotes: notes });
    expect(b.indexOf("**kinh dị**")).toBeLessThan(b.indexOf("**tình cảm**"));
  });

  it("matches names CASE-INSENSITIVELY and ignoring stray whitespace", () => {
    const b = seriesBible({
      ...base,
      genre: " Kinh Dị ",
      genreNotes: notes,
    });
    expect(b.indexOf("**kinh dị**")).toBeLessThan(b.indexOf("**tình cảm**"));
  });

  it("drops an empty description rather than printing a bare bullet", () => {
    const b = seriesBible({
      ...base,
      genreNotes: [{ name: "kinh dị", description: "   " }, notes[0]!],
    });
    expect(b).not.toContain("**kinh dị**");
    expect(b).toContain("**tình cảm**");
  });

  it("the model-facing name replaces the display label EVERYWHERE the model reads", () => {
    // The label `kinh dị` is what listeners search for; `horror` is what a 7–14B
    // model has richer associations for. Miss one place and the model meets two
    // names for one genre and reads two different directions.
    const b = seriesBible({
      ...base,
      genre: "kinh dị",
      tags: ["tình cảm"],
      genreNotes: [
        { name: "kinh dị", promptName: "horror", description: "Fear from the unexplained." },
        { name: "tình cảm", promptName: "romance", description: "A relationship changing." },
      ],
    });
    expect(b).toContain("Genre: horror");
    expect(b).toContain("Sub-genres: romance");
    expect(b).toContain("**horror**");
    expect(b).not.toContain("kinh dị");
    expect(b).not.toContain("tình cảm");
  });

  it("without a model-facing name, the label stands", () => {
    const b = seriesBible({
      ...base,
      genre: "kiếm hiệp",
      genreNotes: [{ name: "kiếm hiệp", description: "Martial arts and the code of the jianghu." }],
    });
    expect(b).toContain("Genre: kiếm hiệp");
  });

  it("a genre absent from the catalogue still shows, rather than leaving a blank", () => {
    // A genre works without being in the catalogue — typed by hand into the
    // sub-genre field, for instance.
    const b = seriesBible({ ...base, genre: "ngôn tình", genreNotes: [] });
    expect(b).toContain("Genre: ngôn tình");
  });

  it("with no descriptions at all it produces no empty section", () => {
    expect(seriesBible({ ...base, genreNotes: [] })).not.toContain("What these genres mean here");
    expect(seriesBible({ ...base, genreNotes: [] })).not.toContain("What these genres mean here");
  });
});

describe("spotlight — describe only who is present in the scene in full", () => {
  const cast = [
    { name: "Hùng", isNarrator: true, role: "tài xế", description: "lì", state: null },
    { name: "Bảy", isNarrator: false, role: "gác bến", description: "hay cười", state: null },
  ];
  const base = {
    title: "Đường về",
    genre: "kinh dị",
    tags: [],
    description: null,
    world: EMPTY_WORLD,
    genreNotes: [],
    characters: cast,
  };

  it("unset describes everyone in full — the old behaviour", () => {
    const b = seriesBible(base);
    expect(b).toContain("lì");
    expect(b).toContain("hay cười");
  });

  it("set, anyone outside the list keeps only name and role", () => {
    const b = seriesBible({ ...base, spotlight: ["Hùng"] });
    expect(b).toContain("lì");
    expect(b).not.toContain("hay cười");
    // The name still has to show: the model must not invent a duplicate.
    expect(b).toContain("Bảy");
    expect(b).toContain("gác bến");
  });

  it("says why the rest was trimmed", () => {
    expect(seriesBible({ ...base, spotlight: ["Hùng"] })).toMatch(/Full detail is given only/i);
  });

  it("matches names case-insensitively and ignoring stray whitespace", () => {
    expect(seriesBible({ ...base, spotlight: [" hùng "] })).toContain("lì");
  });

  it("an empty list counts as unset", () => {
    expect(seriesBible({ ...base, spotlight: [] })).toBe(seriesBible(base));
  });
});

describe("buildBible — the Bible built the moment the outline lands", () => {
  const outline = {
    title: "Chuyến xe cuối cùng",
    logline: "Một tài xế nhận ra hành khách cuối đã chết.",
    // What the MODEL called the genre. Never what gets stored.
    genre: "horror",
    setting: "Quốc lộ miền Trung, thập niên 1970.",
    characters: [
      {
        name: "Tài",
        role: "tài xế",
        outfit: "áo sơ mi bạc",
        appearance: "gầy",
        speech: "cộc lốc",
        voiceHint: "nam trung niên",
      },
    ],
    episodes: [
      { number: 1, title: "Bến Cũ", chapters: [{ title: "Đêm mưa", beats: ["Tài dừng xe."] }], hook: "Ghế 12 trống." },
    ],
  };

  it("carries the genre the WRITER chose, not the model's answer", () => {
    // `Series.genre` is the key into `Genre.name`. The model answers in its own
    // words, and "horror" matches no seeded genre, so the description that makes
    // "kinh dị" mean what the writer means never loads again.
    const b = buildBible(outline, { genre: "kinh dị" });
    expect(b).toContain("Genre: kinh dị");
    expect(b).not.toContain("horror");
  });

  it("describes the cast that became rows, not the model's list", () => {
    // Given a chosen cast the model's extras are dropped before the rows are
    // written; a Bible still describing them puts them back into every scene.
    const b = buildBible(outline, { genre: "kinh dị", cast: [{ name: "Hạnh", role: "cô lái đò" }] });
    expect(b).toContain("- Hạnh: cô lái đò");
    // Named in the beats, so his name is still in the Bible — but not as a character
    // the model may write dialogue for.
    expect(b).not.toContain("- Tài:");
  });

  it("without a cast it falls back to the model's, as before", () => {
    expect(buildBible(outline, { genre: "kinh dị" })).toContain("- Tài:");
  });

  it("the writer's setting beats the model's; blank borrows the model's", () => {
    const mine = { ...EMPTY_WORLD, setting: "Hà Nội, 2005." };
    expect(buildBible(outline, { genre: "kinh dị", world: mine })).toContain("Hà Nội, 2005.");
    expect(buildBible(outline, { genre: "kinh dị" })).toContain("Quốc lộ miền Trung");
  });
});
