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
  it("names models in the schema the client has not generated, with the command to run", () => {
    const msg = staleClientMessage(SCHEMA, ["Series"]);
    expect(msg).toContain("Genre");
    expect(msg).not.toContain("Series");
    expect(msg).toContain("pnpm db:generate");
  });

  it("stays silent when the client has every model", () => {
    expect(staleClientMessage(SCHEMA, ["Series", "Genre"])).toBeNull();
  });

  it("stays silent when the client has extra models — only MISSING ones are an error", () => {
    expect(staleClientMessage(SCHEMA, ["Series", "Genre", "Voice"])).toBeNull();
  });

  it("does not mistake `generator`, `datasource` or the word model mid-line for a model", () => {
    const text = `
datasource db {
  provider = "postgresql"
}

/// A comment containing the word model Fake { to test with
model Real {
  note String /// model Khac {
}
`;
    // Matching the trailing period too: the list has to be exactly one name, with no
    // datasource `db` and no name from a comment.
    expect(staleClientMessage(text, [])).toMatch(/missing model Real\./);
  });
});

describe("accessorName", () => {
  it("lowercases only the first letter, leaving the rest", () => {
    expect(accessorName("Genre")).toBe("genre");
    expect(accessorName("AudioTrack")).toBe("audioTrack");
    // Prisma does NOT lowercase a whole run of capitals: `LlmRun`, not `lLMRun`.
    expect(accessorName("LlmRun")).toBe("llmRun");
  });
});

describe("checkPrismaClient", () => {
  // Uses the REAL schema.prisma rather than a hand-built string: the path to the
  // schema lives inside schema-check.ts itself, and if it is wrong the guard skips
  // silently — a failure that leaves no trace if the test only checks pure logic.
  it("does not throw when the client has every accessor", () => {
    const schema = readSchema();
    const fake = Object.fromEntries(
      [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => [accessorName(m[1]!), {}]),
    );
    expect(() => checkPrismaClient(fake)).not.toThrow();
  });

  it("a missing accessor throws with the model name and the command to run", () => {
    const schema = readSchema();
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
    const fake = Object.fromEntries(
      models.slice(1).map((name) => [accessorName(name), {}]),
    );
    expect(() => checkPrismaClient(fake)).toThrow(
      new RegExp(`missing model ${models[0]}\\b.*pnpm db:generate`, "s"),
    );
  });
});

function readSchema(): string {
  return readFileSync(resolve(import.meta.dirname, "../prisma/schema.prisma"), "utf8");
}
