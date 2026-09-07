import { loadEnv } from "@audio/config";
import { LlmError } from "./provider";

/**
 * The vector's dimension. Must match `vector(1024)` in sql/001-vector.sql.
 * Changing the embedding model means changing both and rebuilding every embedding.
 */
export const EMBED_DIM = 1024;

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
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
 * Mock embeddings — hash the content into a deterministic unit vector.
 *
 * Carries NO meaning: two sentences on one topic will not be near each other. It
 * exists only to verify the data path (storing, querying, ranking) without
 * downloading a model. Do not judge retrieval quality by it.
 */
class MockEmbedding implements EmbeddingProvider {
  readonly name = "mock";
  readonly dim = EMBED_DIM;

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
