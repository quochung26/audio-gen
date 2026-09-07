import type { z } from "zod";
import { zodToJsonSchema as convert } from "zod-to-json-schema";

/**
 * Zod → JSON Schema for Ollama's `format` parameter.
 * `$refStrategy: "none"` keeps the schema flat — Ollama cannot follow $ref.
 */
export function zodToJsonSchema(schema: z.ZodType<unknown>): object {
  return convert(schema, { $refStrategy: "none", target: "jsonSchema7" });
}
