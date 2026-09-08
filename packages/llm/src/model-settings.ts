import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { isProviderName, type ProviderName } from "./providers/active";
import { listInstalledModels, pickInstalledModel } from "./installed-models";

/**
 * Which model does which job.
 *
 * Three tiers, the more specific winning:
 *
 *   1. The model chosen for THIS RUN     — "try this episode on the big model"
 *   2. The PROMPT's model                — this step always uses a smaller one
 *   3. The DEFAULT model                 — the Setting table, falling back to .env
 *
 * The default tier lives in the DB rather than only in `.env` because changing the
 * default model is a routine thing while experimenting; editing `.env` would mean
 * restarting
 */
export type ModelKind = "write" | "utility" | "embed";

const PROVIDER_KEY = "llm.provider";

/**
 * The key storing the default model — SPLIT BY PROVIDER.
 *
 * Sharing one key means switching to OpenRouter, picking claude-sonnet, then
 * switching back to Ollama sends every job asking Ollama for a model called
 * "anthropic/claude-sonnet-4.5", and it dies. And switching back and forth is
 * exactly what people do.
 *
 * Embeddings are not split: they always run locally.
 */
function settingKey(kind: ModelKind, provider: ProviderName): string {
  return kind === "embed" ? "model.embed" : `model.${storageProvider(provider)}.${kind}`;
}

/**
 * Which providers share a default-model slot.
 *
 * `mock` shares with `ollama`: it stands in for a local model and takes the same
 * kind of model name. Split apart, configuration set while running the mock — which
 * is most of the time while setting a machine up — would vanish the moment you
 * switched to real Ollama, with nothing to say so.
 */
function storageProvider(provider: ProviderName): "ollama" | "openrouter" {
  return provider === "openrouter" ? "openrouter" : "ollama";
}

/**
 * What a machine runs before anyone has chosen.
 *
 * NOT the mock: the mock returns a fixed fake outline and says nothing about it, so
 * a machine that never visited the Models page would write fake stories that look
 * real. Ollama unreachable fails loudly instead, which is the right way round.
 */
const DEFAULT_PROVIDER: ProviderName = "ollama";

/**
 * The active provider. One at a time.
 *
 * Lives ONLY in the `Setting` table, written by the Models page, and is re-read on
 * every call so a change takes effect with no worker restart. There is no `.env`
 * value behind it: two places to set one thing meant `.env` reading like the answer
 * while the DB row quietly won.
 */
export async function getActiveProvider(): Promise<ProviderName> {
  const row = await prisma.setting.findUnique({ where: { key: PROVIDER_KEY } });
  const stored = row?.value?.trim();
  if (stored && isProviderName(stored)) return stored;
  return DEFAULT_PROVIDER;
}

/** Change provider. An empty string clears it, back to the built-in default. */
export async function setActiveProvider(value: string): Promise<void> {
  const v = value.trim();
  if (!v) {
    await prisma.setting.deleteMany({ where: { key: PROVIDER_KEY } });
    return;
  }
  if (!isProviderName(v)) throw new Error(`Invalid provider: "${v}"`);
  await prisma.setting.upsert({
    where: { key: PROVIDER_KEY },
    create: { key: PROVIDER_KEY, value: v },
    update: { value: v },
  });
}

/**
 * Where the default came from.
 *
 * `none` is a REAL state, not an error: the machine has no model downloaded that
 * suits that job. This used to fall back to a name written into `.env`, and that
 * name became a lie the moment the machine did not have that model — the job died
 * mid-run with "model not found", rather than saying so when Studio opened.
 */
export type ModelSource = "setting" | "installed" | "none";

export async function getDefaultModel(kind: ModelKind): Promise<string> {
  return (await resolveDefault(kind)).value;
}

async function resolveDefault(kind: ModelKind): Promise<{ value: string; source: ModelSource }> {
  const provider = await getActiveProvider();
  const row = await prisma.setting.findUnique({ where: { key: settingKey(kind, provider) } });

  const stored = row?.value?.trim();
  if (stored) return { value: stored, source: "setting" };

  // The mock provider ignores the model name — and its whole reason to exist is
  // running with no models on the machine. Requiring one breaks exactly that.
  if (provider === "mock") return { value: "mock", source: "installed" };

  // OpenRouter has no notion of "downloaded" — it has to be picked on the Models page.
  if (provider === "openrouter") return { value: "", source: "none" };

  const value = pickInstalledModel({
    installed: await listInstalledModels(loadEnv().OLLAMA_URL),
    wantEmbedding: kind === "embed",
  });
  return value ? { value, source: "installed" } : { value: "", source: "none" };
}

export async function getDefaultModels(): Promise<
  Record<ModelKind, { value: string; source: ModelSource }>
> {
  const kinds: ModelKind[] = ["write", "utility", "embed"];
  const out = {} as Record<ModelKind, { value: string; source: ModelSource }>;
  for (const kind of kinds) out[kind] = await resolveDefault(kind);
  return out;
}

/** Set the default model for the active provider. An empty string reverts to `.env`. */
export async function setDefaultModel(kind: ModelKind, value: string): Promise<void> {
  const provider = await getActiveProvider();
  const key = settingKey(kind, provider);
  const v = value.trim();

  if (!v) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

/**
 * Pick the model for one call.
 *
 * An empty string at a higher tier counts as NOT SET — the form posts `model=""`
 * when the user leaves it blank, and treating that as a choice hands the provider
 * an empty model name and a baffling error.
 */
export async function resolveModel(input: {
  requested?: string | null;
  prompt?: string | null;
  kind: ModelKind;
}): Promise<string> {
  const requested = input.requested?.trim();
  if (requested) return requested;

  const fromPrompt = input.prompt?.trim();
  if (fromPrompt) return fromPrompt;

  const fallback = await getDefaultModel(input.kind);
  if (!fallback) {
    // Stop HERE rather than sending an empty model name: the provider would report
    // something baffling, while this points straight at what to fix.
    throw new Error(
      `No model for step "${input.kind}". Go to the Models page: download one ` +
        `or pick a default. (Running provider "${await getActiveProvider()}".)`,
    );
  }
  return fallback;
}

/**
 * Whether this run needs the machine's GPU.
 *
 * An LLM job reserves `VRAM_LLM_MB` (12 GB by default) for its whole run. A call
 * to OpenRouter uses no VRAM at all, while a network round trip lasts tens of
 * seconds — holding the reservation through that blocks voice cloning and every
 * other GPU job for nothing.
 */
export async function needsLocalGpu(): Promise<boolean> {
  return (await getActiveProvider()) === "ollama";
}
