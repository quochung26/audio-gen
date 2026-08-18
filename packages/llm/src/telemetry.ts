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
 * Ghi lại mỗi lần gọi LLM.
 *
 * Ghi thời gian và tốc độ chứ không ghi tiền: với model chạy tại chỗ, thời gian
 * máy mới là tài nguyên khan hiếm. Bảng này là cách duy nhất để sau này trả lời
 * "model nào, tham số nào cho ra văn hay" thay vì đoán.
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
        durationMs: result.durationMs,
        tokensPerSec: Number(result.tokensPerSec.toFixed(2)),
      },
    })
    .catch(() => {
      // Telemetry hỏng không được làm hỏng job đang chạy.
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
