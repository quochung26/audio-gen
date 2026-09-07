import { Hono } from "hono";
import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import {
  forgetInstalledModels,
  getActiveProvider,
  getDefaultLanguage,
  getDefaultLanguageSource,
  getDefaultModels,
  setDefaultLanguage,
  setActiveProvider,
  setDefaultModel,
  type ModelKind,
  type ProviderName,
} from "@audio/llm";
import { describeConnectError } from "../lib/connect-error";
import {
  collectQuantVariants,
  hfPullTag,
  parseHfRepo,
  type HfFile,
} from "../lib/huggingface";
import { UserError, field } from "../lib/http";
import {
  averagePerEpisode,
  isValidOpenRouterModel,
  parseKeyStatus,
  parseModelList,
  type OpenRouterModel,
} from "../lib/openrouter";
import {
  isValidModelTag,
  newPullProgress,
  reducePull,
  takeLines,
  type OllamaModel,
  type PullProgress,
} from "../lib/ollama";

export const models = new Hono();

/**
 * Download progress, held in the API process's MEMORY.
 *
 * Not in the DB because it is transient state — restart the API and Ollama STILL
 * keeps downloading (the pull runs on Ollama's side), you just lose the progress
 * bar. Clicking download again for the same model resumes rather than restarts.
 *
 * One model at a time: two 9 GB pulls over one connection make both slow, and the
 * UI hard to read.
 */
let pull: PullProgress | null = null;
let pullAbort: AbortController | null = null;

const TIMEOUT_MS = 5_000;

async function ollamaFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${loadEnv().OLLAMA_URL.replace(/\/+$/, "")}${path}`;
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** Connection status, installed models, and the models the system is set to use. */
models.get("/", async (c) => {
  const env = loadEnv();
  const provider = await getActiveProvider();
  let reachable = false;
  let version: string | null = null;
  let installed: OllamaModel[] = [];
  let reason: string | null = null;

  try {
    const v = await ollamaFetch("/api/version");
    if (v.ok) {
      version = ((await v.json()) as { version?: string }).version ?? null;
      reachable = true;
    } else {
      reason = `Ollama returned HTTP ${v.status}`;
    }
  } catch (err) {
    reason = describeConnectError(err, TIMEOUT_MS);
  }

  if (reachable) {
    const res = await ollamaFetch("/api/tags");
    const body = (await res.json()) as {
      models?: Array<{
        name: string;
        size: number;
        modified_at?: string;
        details?: { parameter_size?: string; quantization_level?: string };
      }>;
    };
    installed = (body.models ?? []).map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      parameterSize: m.details?.parameter_size ?? null,
      quantization: m.details?.quantization_level ?? null,
      modifiedAt: m.modified_at ?? null,
    }));
  }

  // The models the system will use. Prompts can override per step — read those
  // too, so we can flag a model referenced but not downloaded.
  const promptModels = await prisma.prompt.findMany({
    where: { active: true, model: { not: null } },
    select: { step: true, genre: true, model: true },
  });

  /**
   * Models ACTUALLY used recently.
   *
   * The source for the per-run model picker. OpenRouter carries 300+ models, and
   * dumping them all into one select is unusable; this list instead grows with
   * what you actually run, so it is nearly always what you want to pick again.
   */
  const recentRuns = await prisma.llmRun.findMany({
    select: { model: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const defaults = await getDefaultModels();

  const recent: string[] = [];
  const seenRecent = new Set<string>();
  const addRecent = (m: string) => {
    if (!m || seenRecent.has(m) || recent.length >= 12) return;
    // Keep only names valid for the active provider: the history holds the other
    // provider's names too, and picking one kills a job mid-episode.
    if (!isValidForProvider(m, provider)) return;
    seenRecent.add(m);
    recent.push(m);
  };

  // The configured model is always in the list, even with no runs yet: right
  // after switching to OpenRouter the history is empty, and the per-run picker
  // would disappear entirely rather than merely being short.
  addRecent(defaults.write.value);
  addRecent(defaults.utility.value);
  for (const r of recentRuns) addRecent(r.model);

  const configured = [
    { label: "Story writing", kind: "write" as ModelKind, ...defaults.write },
    { label: "Utility work — summaries, metadata", kind: "utility" as ModelKind, ...defaults.utility },
    { label: "Embeddings", kind: "embed" as ModelKind, ...defaults.embed },
  ];

  const promptOverrides = promptModels.map((p) => ({
    label: `Prompt ${p.step}${p.genre === "*" ? "" : ` · ${p.genre}`}`,
    model: p.model!,
  }));

  const names = new Set(installed.map((m) => m.name));

  /**
   * "Is it downloaded?" — a question that only means anything under Ollama.
   *
   * OpenRouter models are never downloaded; checking them against Ollama's list
   * would flag every cloud model as "not downloaded" with nothing to download.
   */
  const describeModel = (m: string) => ({
    model: m,
    // Ollama treats "qwen3:14b" and "qwen3:14b:latest" as one; compare both forms.
    installed: provider === "ollama" ? names.has(m) || names.has(`${m}:latest`) : true,
  });

  return c.json({
    reachable,
    reason,
    version,
    url: env.OLLAMA_URL,
    provider,
    envProvider: env.LLM_PROVIDER,
    embedProvider: env.EMBED_PROVIDER,
    installed,
    recent,
    language: await getDefaultLanguageSource(),
    configured: configured.map((x) => ({ ...x, ...describeModel(x.value) })),
    promptOverrides: promptOverrides.map((x) => ({ ...x, ...describeModel(x.model) })),
    pull: withElapsed(pull),
  });
});

/** Set the default model for one kind of work. Blank = fall back to .env. */
models.put("/default/:kind", async (c) => {
  const kind = c.req.param("kind") as ModelKind;
  if (!["write", "utility", "embed"].includes(kind)) throw new UserError("Invalid kind");

  const body = await c.req.parseBody();
  const model = field(body, "model");
  const provider = await getActiveProvider();
  if (model && !isValidForProvider(model, provider)) {
    throw new UserError(
      provider === "openrouter"
        ? `An OpenRouter model name must look like "provider/model": "${model}"`
        : `Invalid model name: "${model}"`,
    );
  }

  await setDefaultModel(kind, model);
  return c.json({ ok: model ? `Default is now ${model}` : "Cleared — back to the .env value" });
});

/**
 * Switch the active provider. One or the other, never both at once.
 *
 * Takes effect on the next model call, including inside a worker mid-run — the
 * choice lives in `Setting` and is read fresh every time.
 */
models.put("/provider", async (c) => {
  const body = await c.req.parseBody();
  const value = field(body, "provider");

  try {
    await setActiveProvider(value);
  } catch (err) {
    throw new UserError((err as Error).message);
  }

  const now = await getActiveProvider();
  return c.json({
    ok:
      now === "openrouter"
        ? "Running on OpenRouter — what you send leaves this machine."
        : now === "ollama"
          ? "Running on local Ollama."
          : "Running on the mock provider.",
  });
});

/**
 * The default language for NEW stories.
 *
 * Leaves existing stories alone: language lives in `Series.language`, fixed when
 * the story is created. Changing the language of a story already being written is
 * a rewrite from scratch, not a settings toggle.
 */
models.put("/language", async (c) => {
  const body = await c.req.parseBody();
  try {
    await setDefaultLanguage(field(body, "language"));
  } catch (err) {
    throw new UserError((err as Error).message);
  }
  const now = await getDefaultLanguage();
  return c.json({ ok: `New stories will be written in ${now === "en" ? "English" : "Vietnamese"}.` });
});

/**
 * Scan a Hugging Face repo and list the quantisations available.
 *
 * Ollama pulls straight from HF given `hf.co/{repo}:{QUANT}`, so all this needs
 * to do is read the repo's file list and group it by quantisation.
 */
models.get("/hf", async (c) => {
  const repo = parseHfRepo(c.req.query("repo") ?? "");
  if (!repo) {
    throw new UserError(
      'Could not read a repo name. Paste a URL like "https://huggingface.co/<user>/<repo>".',
    );
  }

  let res: Response;
  try {
    res = await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`, {
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new UserError(`Could not reach Hugging Face: ${describeConnectError(err, 15_000)}`);
  }

  if (res.status === 404 || res.status === 401 || res.status === 403) {
    // Hugging Face returns 401 for BOTH a missing repo and a private one — on
    // purpose, so it does not leak which repos exist. Say both possibilities
    // rather than guessing one and sending the user the wrong way.
    throw new UserError(
      `Could not read repo "${repo}": it does not exist, or it is private / needs its terms accepted on Hugging Face first. Check the URL.`,
    );
  }
  if (!res.ok) throw new UserError(`Hugging Face returned HTTP ${res.status}`);

  const variants = collectQuantVariants((await res.json()) as HfFile[]);
  if (variants.length === 0) {
    throw new UserError(
      `Repo "${repo}" has no GGUF files. Ollama only runs GGUF — look for a repo ending in "-GGUF".`,
    );
  }

  return c.json({
    repo,
    variants: variants.map((v) => ({ ...v, tag: hfPullTag(repo, v.quant) })),
  });
});

models.get("/pull", (c) => c.json({ pull: withElapsed(pull) }));

/**
 * Compute elapsed time ON THE SERVER.
 *
 * Not `Date.now() - startedAt` in the browser: clocks on two machines drift by
 * minutes routinely, and then the bar reads "-180 seconds elapsed".
 */
function withElapsed(p: PullProgress | null) {
  if (!p) return null;
  return { ...p, elapsedMs: (p.finishedAt ?? Date.now()) - p.startedAt };
}

models.post("/pull", async (c) => {
  const body = await c.req.parseBody();
  const model = field(body, "model");

  if (!model) throw new UserError("No model selected");
  if (!isValidModelTag(model)) throw new UserError(`Invalid model name: "${model}"`);
  if (pull && !pull.done) throw new UserError(`Already downloading "${pull.model}". Wait for it or stop it.`);

  pull = newPullProgress(model);
  pullAbort = new AbortController();
  void runPull(model, pullAbort.signal);

  return c.json({ ok: `Started downloading ${model}` });
});

models.delete("/pull", (c) => {
  pullAbort?.abort();
  if (pull && !pull.done) {
    pull = { ...pull, done: true, error: "Stopped on request", finishedAt: Date.now() };
  }
  return c.json({ ok: "Download stopped." });
});

models.delete("/:name{.+}", async (c) => {
  const name = decodeURIComponent(c.req.param("name"));
  if (!isValidModelTag(name)) throw new UserError("Invalid model name");

  const res = await ollamaFetch("/api/delete", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: name }),
  });
  if (!res.ok) throw new UserError(`Ollama could not delete it: HTTP ${res.status}`);
  // The cached list is now wrong — auto-selected defaults must see this at once.
  forgetInstalledModels();
  return c.json({ ok: `Deleted ${name}` });
});

/* ─────────────────────────── OpenRouter ─────────────────────────── */

/**
 * The model list, cached in memory.
 *
 * OpenRouter carries 300+ models and the list barely changes within a day;
 * refetching on every page open downloads a few hundred KB for nothing.
 */
let modelCache: { at: number; models: OpenRouterModel[] } | null = null;
const MODEL_CACHE_MS = 10 * 60 * 1000;

function openRouterUrl(path: string): string {
  return `${loadEnv().OPENROUTER_URL.replace(/\/+$/, "")}${path}`;
}

/**
 * OpenRouter connection status.
 *
 * Does NOT return the API key in any form — not truncated, not masked. This goes
 * straight to the browser.
 */
models.get("/openrouter", async (c) => {
  const env = loadEnv();
  const hasKey = env.OPENROUTER_API_KEY.length > 0;

  // Cost estimates come from REAL recorded runs, not guesses.
  const runs = await prisma.llmRun.findMany({
    where: { episodeId: { not: null } },
    select: { episodeId: true, inputTokens: true, outputTokens: true },
  });
  const usage = averagePerEpisode(runs);

  const base = {
    hasKey,
    url: env.OPENROUTER_URL,
    active: (await getActiveProvider()) === "openrouter",
    usage,
  };

  if (!hasKey) {
    return c.json({
      ...base,
      reachable: false,
      reason: "OPENROUTER_API_KEY is not set in .env",
      key: null,
    });
  }

  try {
    const res = await fetch(openRouterUrl("/key"), {
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401) {
      return c.json({
        ...base,
        reachable: false,
        reason: "OpenRouter rejected this key (401). Check OPENROUTER_API_KEY.",
        key: null,
      });
    }
    if (!res.ok) {
      return c.json({ ...base, reachable: false, reason: `OpenRouter returned HTTP ${res.status}`, key: null });
    }

    return c.json({ ...base, reachable: true, reason: null, key: parseKeyStatus(await res.json()) });
  } catch (err) {
    return c.json({ ...base, reachable: false, reason: describeConnectError(err, TIMEOUT_MS), key: null });
  }
});

/** The models OpenRouter currently offers, with prices. */
models.get("/openrouter/models", async (c) => {
  if (modelCache && Date.now() - modelCache.at < MODEL_CACHE_MS) {
    return c.json({ models: modelCache.models, cached: true });
  }

  const env = loadEnv();
  try {
    const res = await fetch(openRouterUrl("/models"), {
      // The model list is public, but sending the key makes OpenRouter filter it
      // by the account's access — closer to what can actually be called.
      headers: env.OPENROUTER_API_KEY
        ? { authorization: `Bearer ${env.OPENROUTER_API_KEY}` }
        : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new UserError(`OpenRouter returned HTTP ${res.status}`);

    const list = parseModelList(await res.json());
    modelCache = { at: Date.now(), models: list };
    return c.json({ models: list, cached: false });
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError(`Could not fetch the model list: ${describeConnectError(err, TIMEOUT_MS)}`);
  }
});

/**
 * Runs in the background, reading Ollama's NDJSON stream and updating `pull`.
 *
 * Deliberately NOT using `ollamaFetch`'s timeout: a 9 GB model takes tens of
 * minutes, and cutting it off after 5 seconds breaks it immediately.
 */
async function runPull(model: string, signal: AbortSignal): Promise<void> {
  const layers = new Map<string, { completed: number; total: number }>();
  try {
    const url = `${loadEnv().OLLAMA_URL.replace(/\/+$/, "")}/api/pull`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      signal,
    });

    if (!res.ok || !res.body) {
      pull = { ...pull!, done: true, error: `Ollama returned HTTP ${res.status}`, finishedAt: Date.now() };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { chunks, rest } = takeLines(buffer);
      buffer = rest;
      for (const ch of chunks) pull = reducePull(pull!, ch, layers);
      if (pull?.done) return;
    }

    forgetInstalledModels();

    // Stream ended without a "success" line — treat it as done, but say so.
    if (pull && !pull.done) {
      pull = { ...pull, done: true, status: "ended", finishedAt: Date.now() };
    }
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    if (pull) {
      pull = {
        ...pull,
        done: true,
        error: aborted ? "Stopped on request" : (err as Error).message,
        finishedAt: Date.now(),
      };
    }
  }
}


/**
 * Whether a model name is valid for the active provider.
 *
 * The two name things completely differently: Ollama uses "qwen3:14b",
 * OpenRouter uses "provider/model". Validating against the active provider's rule
 * surfaces the error at save time, rather than mid-episode when a job runs.
 */
function isValidForProvider(model: string, provider: ProviderName): boolean {
  return provider === "openrouter" ? isValidOpenRouterModel(model) : isValidModelTag(model);
}
