import { describe, expect, it } from "vitest";
import { staleClientMessage } from "./schema-check";

const SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

model Series {
  id String @id
}

model Genre {
  id String @id
}
`;

describe("staleClientMessage", () => {
  it("nêu tên model có trong schema mà client chưa sinh, kèm lệnh cần chạy", () => {
    const msg = staleClientMessage(SCHEMA, ["Series"]);
    expect(msg).toContain("Genre");
    expect(msg).not.toContain("Series");
    expect(msg).toContain("pnpm db:generate");
  });

  it("client đủ model thì im lặng", () => {
    expect(staleClientMessage(SCHEMA, ["Series", "Genre"])).toBeNull();
  });

  it("client thừa model thì cũng im lặng — chỉ THIẾU mới là lỗi", () => {
    expect(staleClientMessage(SCHEMA, ["Series", "Genre", "Voice"])).toBeNull();
  });

  it("không nhầm `generator`, `datasource` hay chữ model giữa dòng là model", () => {
    const text = `
datasource db {
  provider = "postgresql"
}

/// Ghi chú có chữ model Fake { để thử
model Real {
  note String /// model Khac {
}
`;
    // Khớp cả dấu chấm cuối: danh sách phải đúng bằng một cái tên, không kèm
    // `db` của datasource hay tên nằm trong ghi chú.
    expect(staleClientMessage(text, [])).toMatch(/thiếu model Real\./);
  });
});
