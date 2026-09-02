import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { accessorName, checkPrismaClient, staleClientMessage } from "./schema-check";

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

describe("accessorName", () => {
  it("chỉ hạ chữ cái đầu, giữ nguyên phần còn lại", () => {
    expect(accessorName("Genre")).toBe("genre");
    expect(accessorName("AudioTrack")).toBe("audioTrack");
    // Prisma KHÔNG hạ cả cụm viết hoa liền: `LlmRun` chứ không phải `lLMRun`.
    expect(accessorName("LlmRun")).toBe("llmRun");
  });
});

describe("checkPrismaClient", () => {
  // Dùng schema.prisma THẬT chứ không phải chuỗi dựng sẵn: đường dẫn tới schema
  // nằm trong chính schema-check.ts, và nó sai thì guard im lặng bỏ qua — một
  // kiểu hỏng không để lại dấu vết nào nếu test chỉ kiểm phần thuần logic.
  it("client đủ accessor thì không ném", () => {
    const schema = readSchema();
    const fake = Object.fromEntries(
      [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => [accessorName(m[1]!), {}]),
    );
    expect(() => checkPrismaClient(fake)).not.toThrow();
  });

  it("thiếu một accessor là ném kèm tên model và lệnh cần chạy", () => {
    const schema = readSchema();
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
    const fake = Object.fromEntries(
      models.slice(1).map((name) => [accessorName(name), {}]),
    );
    expect(() => checkPrismaClient(fake)).toThrow(
      new RegExp(`thiếu model ${models[0]}\\b.*pnpm db:generate`, "s"),
    );
  });
});

function readSchema(): string {
  return readFileSync(resolve(import.meta.dirname, "../prisma/schema.prisma"), "utf8");
}
