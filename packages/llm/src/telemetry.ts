import { prisma, type PromptStep } from "@audio/database";
import type { GenerateResult } from "./provider";

export interface TelemetryContext {
  step: PromptStep;
  episodeId?: string;
  sceneId?: string;
  promptId?: string;
  params: Record<string, unknown>;
}

/**
 * Record every LLM call.
 *
 * The only way to later answer "which model and which parameters give the best prose"
 * instead of guessing — and, since the calls started going to a gateway that charges,
 * the only record of what a story cost to write.
 */
export async function recordRun(
  ctx: TelemetryContext,
  result: GenerateResult,
): Promise<void> {
  await prisma.llmRun
    .create({
      data: {
        step: ctx.step,
        episodeId: ctx.episodeId ?? null,
        sceneId: ctx.sceneId ?? null,
        promptId: ctx.promptId ?? null,
        model: result.model,
        params: ctx.params as object,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        tokensPerSec: Number(result.tokensPerSec.toFixed(2)),
      },
    })
    .catch(() => {
      // A broken telemetry write must not break the job it is recording.
    });
}

export async function recordFailure(ctx: TelemetryContext, error: string): Promise<void> {
  await prisma.llmRun
    .create({
      data: {
        step: ctx.step,
        episodeId: ctx.episodeId ?? null,
        sceneId: ctx.sceneId ?? null,
        promptId: ctx.promptId ?? null,
        model: "unknown",
        params: ctx.params as object,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        tokensPerSec: 0,
        error,
      },
    })
    .catch(() => {});
}
