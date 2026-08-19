import { describe, expect, it } from "vitest";
import {
  DANGLING_FK_COLUMNS,
  forPublish,
  LOCAL_ONLY_TABLES,
  PRIVATE_COLUMNS,
  PUBLIC_TABLES,
  stripPrivate,
} from "./publish-scope";

/**
 * Đây là ranh giới quyền riêng tư: thứ gì được rời khỏi máy sản xuất.
 * Sai ở đây thì bản thảo, Story Bible và prompt đi lên internet.
 */

describe("stripPrivate", () => {
  it("bỏ Story Bible khỏi Series", () => {
    const out = stripPrivate("Series", { id: "s1", title: "Đường về", storyBible: { world: {} } });
    expect(out).toEqual({ id: "s1", title: "Đường về" });
    expect("storyBible" in out).toBe(false);
  });

  it("bỏ bản thảo và dấu vết người duyệt khỏi Episode", () => {
    const out = stripPrivate("Episode", {
      id: "e1",
      title: "Tập 1",
      draftText: "toàn bộ bản thảo",
      outline: { beats: [] },
      reviewedBy: "hung",
      reviewedAt: new Date(),
      summary: "tóm tắt công khai",
    });
    expect(out).toEqual({ id: "e1", title: "Tập 1", summary: "tóm tắt công khai" });
  });

  it("bỏ mô tả tính cách khỏi Character", () => {
    const out = stripPrivate("Character", { id: "c1", name: "Tài", description: "cách nói" });
    expect(out).toEqual({ id: "c1", name: "Tài" });
  });

  it("Export không có gì phải bỏ", () => {
    const row = { id: "x1", url: "series/a/b.mp3", sizeBytes: 1 };
    expect(stripPrivate("Export", row)).toEqual(row);
  });
});

describe("forPublish", () => {
  it("xoá khoá ngoại trỏ sang bảng chỉ có ở local", () => {
    // Không xoá thì DB hosted báo lỗi ràng buộc vì không có bảng Voice —
    // và chỉ lỗi với nhân vật ĐÃ gán giọng, nên rất dễ lọt qua lúc thử.
    expect(forPublish("Character", { id: "c1", name: "Tài", voiceId: "v1" })).toEqual({
      id: "c1",
      name: "Tài",
      voiceId: null,
    });
  });

  it("xoá nhạc nền khỏi Episode", () => {
    expect(forPublish("Episode", { id: "e1", bgmTrackId: "t1", introTrackId: "t2" })).toMatchObject({
      bgmTrackId: null,
      introTrackId: null,
    });
  });

  it("xoá giọng mặc định khỏi Series", () => {
    expect(forPublish("Series", { id: "s1", defaultVoiceId: "v1" })).toEqual({
      id: "s1",
      defaultVoiceId: null,
    });
  });

  it("làm CẢ hai việc: bỏ cột riêng tư VÀ xoá khoá ngoại", () => {
    const out = forPublish("Character", {
      id: "c1",
      name: "Tài",
      description: "riêng tư",
      voiceId: "v1",
    });
    expect(out).toEqual({ id: "c1", name: "Tài", voiceId: null });
  });

  it("không tự thêm cột mà bản ghi vốn không có", () => {
    // Bản ghi thiếu cột thì để nguyên thiếu, không nhét null vào — nhét vào là
    // ghi đè giá trị đang có ở hosted khi upsert.
    expect(forPublish("Character", { id: "c1", name: "Tài" })).toEqual({ id: "c1", name: "Tài" });
  });
});

describe("khai báo phạm vi", () => {
  it("mọi bảng công khai đều có mục trong hai bảng cấu hình", () => {
    for (const t of PUBLIC_TABLES) {
      expect(PRIVATE_COLUMNS[t], `PRIVATE_COLUMNS thiếu ${t}`).toBeDefined();
      expect(DANGLING_FK_COLUMNS[t], `DANGLING_FK_COLUMNS thiếu ${t}`).toBeDefined();
    }
  });

  it("bảng chỉ-local không được nằm trong danh sách công khai", () => {
    for (const t of LOCAL_ONLY_TABLES) {
      expect(PUBLIC_TABLES).not.toContain(t as never);
    }
  });

  it("bản thảo và Story Bible nằm trong danh sách cấm — khoá lại để không ai gỡ", () => {
    expect(PRIVATE_COLUMNS.Episode).toContain("draftText");
    expect(PRIVATE_COLUMNS.Series).toContain("storyBible");
  });

  it("Prompt và LlmRun chỉ ở local", () => {
    expect(LOCAL_ONLY_TABLES).toContain("Prompt");
    expect(LOCAL_ONLY_TABLES).toContain("LlmRun");
  });
});

describe("Block — lời truyện", () => {
  const row = {
    id: "b1",
    episodeId: "e1",
    order: 1,
    text: "Trời tối, xe chạy chậm lại.",
    speakerLabel: "narrator",
    characterId: "c1",
    pauseAfter: 400,
    ttsEngine: "KOKORO",
    voiceId: "vn-male-1",
    speed: 1.05,
    pitch: null,
    approved: true,
    sfxHint: "tiếng phanh",
    sfxTrackId: "t1",
    audioAssetId: "a1",
  };

  it("LỜI ĐƯỢC đi — đó là thứ phát ra trong MP3", () => {
    // Khác `Episode.draftText` là bản thảo thô. Lời đã duyệt thì đăng kèm audio
    // là bình thường, và trang nghe dùng nó cho mục "Đọc lời truyện".
    const out = forPublish("Block", row);
    expect(out.text).toBe("Trời tối, xe chạy chậm lại.");
    expect(out.speakerLabel).toBe("narrator");
    expect(out.order).toBe(1);
  });

  it("bỏ chi tiết sản xuất bỏ được", () => {
    const out = forPublish("Block", row);
    for (const col of ["speed", "pitch", "approved", "sfxHint"]) {
      expect(out, `${col} không cần rời máy`).not.toHaveProperty(col);
    }
  });

  it("GIỮ ttsEngine và voiceId vì chúng NOT NULL bên hosted", () => {
    // Không phải vì chúng đáng công khai, mà vì hai DB dùng chung một schema:
    // bỏ cột bắt buộc là `create` bên hosted lỗi "Argument is missing".
    const out = forPublish("Block", row);
    expect(out.ttsEngine).toBe("KOKORO");
    expect(out.voiceId).toBe("vn-male-1");
  });

  it("xoá khoá ngoại trỏ sang bảng không đồng bộ", () => {
    const out = forPublish("Block", row);
    expect(out.sfxTrackId).toBeNull();
    expect(out.audioAssetId).toBeNull();
    // characterId GIỮ: Character có trong danh sách đồng bộ.
    expect(out.characterId).toBe("c1");
  });
});

describe("mọi bảng công khai đều được job PUBLISH đụng tới", () => {
  it("không bảng nào lọt khe", async () => {
    // Bug đã gặp: Block không có trong PUBLIC_TABLES lẫn LOCAL_ONLY_TABLES nên
    // không ai đồng bộ, và tính năng đọc lời truyện âm thầm biến mất.
    const { readFile } = await import("node:fs/promises");
    const job = await readFile(
      new URL("../../../apps/worker/src/jobs/publish.job.ts", import.meta.url),
      "utf8",
    );
    for (const t of PUBLIC_TABLES) {
      const model = t[0]!.toLowerCase() + t.slice(1);
      expect(job, `publish.job không ghi bảng ${t}`).toContain(`prismaPlayer.${model}.upsert`);
    }
  });
});

describe("chỉ bỏ được cột mà DB hosted chấp nhận thiếu", () => {
  it("mọi cột trong PRIVATE_COLUMNS đều nullable hoặc có @default", async () => {
    // Bug đã gặp: bỏ `Block.ttsEngine` (NOT NULL) làm job đồng bộ chết với
    // "Argument `ttsEngine` is missing" — mà chỉ chết lúc chạy thật, không phải
    // lúc build. Hai DB dùng chung một schema nên cột bắt buộc phải đi theo.
    const { readFile } = await import("node:fs/promises");
    const schema = await readFile(
      new URL("../prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    for (const table of PUBLIC_TABLES) {
      const model = new RegExp(`^model ${table} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
      expect(model, `không tìm thấy model ${table}`).toBeDefined();

      for (const col of PRIVATE_COLUMNS[table]) {
        const line = model!
          .split("\n")
          .find((l) => new RegExp(`^\\s+${col}\\s`).test(l));
        expect(line, `${table}.${col} không có trong schema`).toBeDefined();

        const optional = /\?\s*($|\/\/)/.test(line!) || /\?\s/.test(line!);
        const hasDefault = line!.includes("@default");
        expect(
          optional || hasDefault,
          `${table}.${col} là NOT NULL và không có @default — bỏ nó đi thì job đồng bộ chết`,
        ).toBe(true);
      }
    }
  });
});
