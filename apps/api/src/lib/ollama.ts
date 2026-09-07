/**
 * Ollama client for the model settings page.
 *
 * Deliberately separate from `@audio/llm`: that package does GENERATION, this one
 * does model management (list, pull, delete). Merged, the worker would carry
 * management code it never uses.
 */

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  parameterSize: string | null;
  quantization: string | null;
  modifiedAt: string | null;
}

export interface PullProgress {
  /** The model being pulled, e.g. "qwen3:14b-q4_K_M". */
  model: string;
  /** What Ollama is doing: "pulling manifest", "downloading …", "success"… */
  status: string;
  completedBytes: number;
  totalBytes: number;
  done: boolean;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

/** One NDJSON line from `/api/pull`. */
export interface PullChunk {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

/**
 * Fold one progress line into the state so far.
 *
 * Ollama reports progress PER IMAGE LAYER, each with its own `digest` and a
 * `completed` that restarts at 0. Adding `completed` straight up makes the bar
 * jump backwards at every new layer. So it has to sum per digest.
 */
export function reducePull(
  prev: PullProgress,
  chunk: PullChunk,
  layers: Map<string, { completed: number; total: number }>,
): PullProgress {
  if (chunk.error) {
    return { ...prev, error: chunk.error, done: true, finishedAt: Date.now() };
  }

  if (chunk.digest && typeof chunk.total === "number") {
    layers.set(chunk.digest, {
      completed: chunk.completed ?? 0,
      total: chunk.total,
    });
  }

  let completedBytes = 0;
  let totalBytes = 0;
  for (const l of layers.values()) {
    completedBytes += l.completed;
    totalBytes += l.total;
  }

  // "success" is the last line Ollama sends when the pull finishes.
  const done = chunk.status === "success";

  return {
    ...prev,
    status: chunk.status ?? prev.status,
    completedBytes,
    totalBytes,
    done,
    finishedAt: done ? Date.now() : prev.finishedAt,
  };
}

/**
 * Split complete NDJSON lines out of the buffer.
 *
 * Returns the remainder too: a network chunk can cut through the middle of a JSON
 * line, and parsing that is a syntax error. The remainder waits for the next
 * chunk to be appended.
 */
export function takeLines(buffer: string): { chunks: PullChunk[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const chunks: PullChunk[] = [];

  for (const line of parts) {
    const t = line.trim();
    if (!t) continue;
    try {
      chunks.push(JSON.parse(t) as PullChunk);
    } catch {
      // Skip a broken line — losing one progress tick beats killing the pull.
    }
  }
  return { chunks, rest };
}

export function newPullProgress(model: string): PullProgress {
  return {
    model,
    status: "starting",
    completedBytes: 0,
    totalBytes: 0,
    done: false,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
}

/** A valid model tag: `name[:tag]`, only the characters Ollama allows. */
export function isValidModelTag(tag: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(:[a-zA-Z0-9._-]+)?$/.test(tag) && tag.length <= 128;
}
