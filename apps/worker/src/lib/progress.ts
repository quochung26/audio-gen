/**
 * Move a job's progress along from the tokens a model is streaming back.
 *
 * The one model call IS the job, for outlining and the like: thirty seconds to
 * several minutes, and it used to report nothing at all. The bar sat at its
 * starting number the whole time and then jumped straight to done, which reads
 * exactly like a stuck job — there is no way to tell "still writing" from "the
 * worker died".
 *
 * Every provider streams (see `OllamaProvider.#call`), so the text arriving is the
 * only honest measure there is of how far along it is.
 */
export function streamProgress({
  setProgress,
  from,
  to,
  maxTokens,
}: {
  setProgress: (percent: number) => Promise<void>;
  /** Where the bar already is when the call starts. */
  from: number;
  /**
   * Where it should be when the model stops. A CEILING, not a promise: `maxTokens`
   * is the budget, not a prediction, and a model that answers in half of it leaves
   * the bar short. The step after the call sets the real number, so falling short
   * only means a jump at the end — while overshooting would mean a bar that sits at
   * 100% with the job still running, which is worse.
   */
  to: number;
  maxTokens?: number;
}): (chunk: string) => void {
  // Characters rather than chunks: one chunk is one token on Ollama, one delta on
  // OpenRouter and 24 characters on the mock, so counting them would make the bar
  // move at a different speed per provider. Three characters to a token is the
  // estimate the mock provider already uses. Being off only changes the pace.
  const budget = Math.max(1, (maxTokens ?? 2000) * 3);

  let chars = 0;
  let last = from;

  return (chunk: string) => {
    chars += chunk.length;

    const next = Math.round(from + (to - from) * Math.min(1, chars / budget));
    // Only ever forwards, and only when the whole number actually changes: this runs
    // once per token, and a DB write per token would cost more than the generation.
    if (next <= last) return;
    last = next;

    // Not awaited. This is called from inside the read loop, so waiting on Postgres
    // here would stall the stream itself; and a dropped update costs nothing,
    // because the next token sends another.
    void setProgress(next).catch(() => {});
  };
}
