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
