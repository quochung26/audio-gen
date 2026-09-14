import {
  FACT_MIN_SIMILARITY,
  FACT_MIN_SIMILARITY_OPENROUTER,
  OPENROUTER_EMBED_MODEL,
  loadEnv,
} from "@audio/config";
import { LlmError } from "./provider";

/**
 * The vector's dimension. Must match `vector(1024)` in sql/001-vector.sql.
 * Changing the embedding model means changing both and rebuilding every embedding.
 */
export const EMBED_DIM = 1024;

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  /**
   * The cosine floor a retrieved fact has to clear, for THIS model.
   *
   * On the provider rather than imported where it is used, because it belongs to the
   * model and not to the idea of similarity: each one puts its vectors at its own
   * scale. Under gemini-embedding-001, unrelated Vietnamese pairs score 0.47–0.54 —
   * a floor tuned for bge-m3's 0.30–0.34 would let every one of them through, with
   * nothing failing and nothing logged. Carried with the vectors, a swapped model
   * cannot leave its threshold behind.
   */
  readonly minSimilarity: number;
  /** Embed several passages at once — embeddings are cheap, and batching is far more efficient. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Ollama embedding.
 *
 * bge-m3 is strong on Vietnamese and returns 1024 dimensions. **CPU is enough** —
 * embedding one sentence takes a few milliseconds, not worth taking VRAM from the
 * writing model. The same reasoning put Kokoro on the CPU (PLAN.md section 6.1).
 */
class OllamaEmbedding implements EmbeddingProvider {
  readonly name = "ollama";
  readonly dim = EMBED_DIM;
  readonly minSimilarity = FACT_MIN_SIMILARITY;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
      });
    } catch (err) {
      throw new LlmError(`Could not reach Ollama at ${this.baseUrl} to embed.`, err);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // The most common cause: `ollama pull bge-m3` has not been run.
      throw new LlmError(
        `Ollama returned error ${res.status} while embedding: ${body}\n` +
          `Has \`ollama pull ${this.model}\` been run?`,
      );
    }

    const data = (await res.json()) as { embeddings?: number[][] };
    if (!data.embeddings || data.embeddings.length !== texts.length) {
      throw new LlmError(
        `Ollama returned ${data.embeddings?.length ?? 0} vectors for ${texts.length} passages.`,
      );
    }

    for (const v of data.embeddings) {
      if (v.length !== this.dim) {
        throw new LlmError(
          `Model "${this.model}" returned ${v.length}-dimensional vectors, but the DB column is ${this.dim}. ` +
            `Fix EMBED_DIM and sql/001-vector.sql, then rebuild every embedding.`,
        );
      }
    }
    return data.embeddings;
  }
}

/**
 * OpenRouter embedding.
 *
 * Not routed through the chat `ActiveProvider`: embedding is a separate decision from
 * writing, set by `EMBED_PROVIDER` in `.env`, and the two are usefully different. The
 * common case for wanting this is a machine with no local Ollama — or one whose Ollama
 * is on another host that is currently unreachable — where the writing already runs in
 * the cloud and the vector store is the only thing left waiting on a local model.
 *
 * `dimensions: 1024` on every request. The model's own default is 3072, and the column
 * is `vector(1024)`; without it every insert fails on width. Asking for 1024 is not a
 * truncation hack, it is what the model supports natively.
 *
 * The endpoint is real but undocumented in OpenRouter's model list — `/api/v1/models`
 * returns chat models only, so no embedding model appears there. It was confirmed by
 * calling it.
 */
class OpenRouterEmbedding implements EmbeddingProvider {
  readonly name = "openrouter";
  readonly dim = EMBED_DIM;
  readonly minSimilarity = FACT_MIN_SIMILARITY_OPENROUTER;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dim }),
      });
    } catch (err) {
      throw new LlmError(`Could not reach OpenRouter at ${this.baseUrl} to embed.`, err);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LlmError(`OpenRouter returned error ${res.status} while embedding: ${body}`);
    }

    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    const vectors = (data.data ?? []).map((d) => d.embedding);
    if (vectors.length !== texts.length) {
      throw new LlmError(
        `OpenRouter returned ${vectors.length} vectors for ${texts.length} passages.`,
      );
    }

    for (const v of vectors) {
      if (v.length !== this.dim) {
        throw new LlmError(
          `Model "${this.model}" returned ${v.length}-dimensional vectors, but the DB column is ${this.dim}. ` +
            `Was \`dimensions\` ignored? Every stored vector would have to be rebuilt.`,
        );
      }
    }
    return vectors;
  }
}

/**
 * Mock embeddings — hash the content into a deterministic unit vector.
 *
 * Carries NO meaning: two sentences on one topic will not be near each other. It
 * exists only to verify the data path (storing, querying, ranking) without
 * downloading a model. Do not judge retrieval quality by it.
 */
class MockEmbedding implements EmbeddingProvider {
  readonly name = "mock";
  readonly dim = EMBED_DIM;
  // Meaningless either way — word-overlap hashing has no scale to tune against.
  readonly minSimilarity = FACT_MIN_SIMILARITY;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashVector(t, this.dim));
  }
}

function hashVector(text: string, dim: number): number[] {
  // Hash each word into dimensions — the same word hits the same dimension, so
  // sentences sharing words end up near each other. Enough to verify ranking, not
  // real semantics.
  const v = new Array<number>(dim).fill(0);
  for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    let h = 2166136261;
    for (let i = 0; i < word.length; i++) {
      h ^= word.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const slot = Math.abs(h) % dim;
    v[slot] = (v[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

let cached: EmbeddingProvider | undefined;

/**
 * The embedding provider.
 *
 * The model no longer comes from `.env` but from the Models page (or a downloaded
 * model suited to embedding). Hence this being async — the provider has to know its
 * model before being built, rather than leaving it blank and sending Ollama nothing.
 */
export async function getEmbedding(): Promise<EmbeddingProvider> {
  if (cached) return cached;
  const env = loadEnv();

  if (env.EMBED_PROVIDER === "openrouter") {
    if (!env.OPENROUTER_API_KEY) {
      throw new LlmError(
        "EMBED_PROVIDER is openrouter but OPENROUTER_API_KEY is not set in .env.",
      );
    }
    // The model is a constant, not `resolveModel`: the Models page's embed slot holds
    // an Ollama tag, and sending "bge-m3" to OpenRouter asks for a model that does not
    // exist there. See OPENROUTER_EMBED_MODEL for why it is not configurable.
    cached = new OpenRouterEmbedding(
      env.OPENROUTER_API_KEY,
      env.OPENROUTER_URL,
      OPENROUTER_EMBED_MODEL,
    );
    return cached;
  }

  if (env.EMBED_PROVIDER !== "ollama") {
    cached = new MockEmbedding();
    return cached;
  }

  const { resolveModel } = await import("./model-settings");
  cached = new OllamaEmbedding(env.OLLAMA_URL, await resolveModel({ kind: "embed" }));
  return cached;
}

/** Forget the remembered provider — call when the embedding model changes. */
export function forgetEmbedding(): void {
  cached = undefined;
}

/** Format a vector for pgvector: '[0.1,0.2,...]' */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
