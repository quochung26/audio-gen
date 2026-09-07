import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The default language for new stories — the same shape as the default model:
 * `.env` is the starting value, and a UI choice writes to `Setting` and overrides it.
 */
const settings = new Map<string, string>();

vi.mock("@audio/database", () => ({
  prisma: {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        settings.set(where.key, create.value);
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
      },
    },
  },
}));

const env = { language: "vi" as "vi" | "en" };
vi.mock("@audio/config", () => ({ loadEnv: () => ({ CONTENT_LANGUAGE: env.language }) }));

const { getDefaultLanguage, getDefaultLanguageSource, setDefaultLanguage } = await import(
  "./language-settings"
);

beforeEach(() => {
  settings.clear();
  env.language = "vi";
});

describe("the default language", () => {
  it("unset, it comes from .env", async () => {
    env.language = "en";
    expect(await getDefaultLanguage()).toBe("en");
  });

  it("a UI setting overrides .env", async () => {
    await setDefaultLanguage("en");
    expect(await getDefaultLanguage()).toBe("en");
  });

  it("clearing it reverts to .env", async () => {
    await setDefaultLanguage("en");
    await setDefaultLanguage("");
    expect(await getDefaultLanguage()).toBe("vi");
  });

  it("rejects an unknown code", async () => {
    await expect(setDefaultLanguage("fr")).rejects.toThrow(/fr/);
  });

  it("junk in the DB falls back to .env rather than killing a job", async () => {
    settings.set("content.language", "klingon");
    expect(await getDefaultLanguage()).toBe("vi");
  });

  it("says where it is coming from", async () => {
    expect(await getDefaultLanguageSource()).toEqual({ value: "vi", fromEnv: true });
    await setDefaultLanguage("en");
    expect(await getDefaultLanguageSource()).toEqual({ value: "en", fromEnv: false });
  });
});
