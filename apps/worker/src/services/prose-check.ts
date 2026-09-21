import { lintProse, type Violation } from "@audio/core";
import { logger } from "../lib/logger";

/**
 * Run the mechanical checks over a scene and say what they found.
 *
 * Shared by WRITE_SCENE and TRANSLATE so both report the same way: a scene is checked
 * once in the language it was drafted in, and again in the language it ends up in — which
 * is where English residue shows up, because the rewrite is the step that produces it.
 *
 * Returns the violations for the caller to store alongside whatever else it is writing.
 * They are NOT written here: a scene is saved in one update, and a second write just to
 * record a warning is a second chance to fail.
 *
 * Logged at warn only when something was found. A clean scene says nothing — a line per
 * scene saying "nothing wrong" is how a log stops being read.
 */
export function checkScene(input: {
  label: string;
  text: string;
  language: string;
  previous?: string | null;
}): Violation[] {
  const violations = lintProse(input.text, {
    language: input.language,
    previous: input.previous ?? null,
  });
  if (violations.length === 0) return violations;

  const worst = violations.some((v) => v.severity === "error") ? "error" : "warning";
  logger.warn(
    `[prose] scene ${input.label} — ${violations.length} ${worst}-level finding` +
      `${violations.length === 1 ? "" : "s"}: ` +
      violations.map((v) => `${v.rule} (${v.actual}${v.limit ? ` of ${v.limit}` : ""})`).join(", "),
  );
  return violations;
}
