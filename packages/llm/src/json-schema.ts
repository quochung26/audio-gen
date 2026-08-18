import type { z } from "zod";
import { zodToJsonSchema as convert } from "zod-to-json-schema";

/**
 * Zod → JSON Schema cho tham số `format` của Ollama.
 * `$refStrategy: "none"` để schema phẳng — Ollama không theo được $ref.
 */
export function zodToJsonSchema(schema: z.ZodType<unknown>): object {
  return convert(schema, { $refStrategy: "none", target: "jsonSchema7" });
}
