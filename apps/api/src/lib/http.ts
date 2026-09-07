import type { Context } from "hono";

/**
 * An error the USER hits in normal use and can fix themselves: an unapproved
 * draft, a track still used by an episode, a prompt with a bad variable.
 *
 * Throw this and the API returns 400 with the message verbatim, shown in place
 * by the UI. UNEXPECTED errors (missing id, dead DB) should throw naturally —
 * the API returns 500 and hides the detail, because that is a bug, not something
 * the user can act on.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** Read a required field from a form body. */
export function field(body: Record<string, unknown>, name: string): string {
  const v = body[name];
  return typeof v === "string" ? v.trim() : "";
}

/** One item per line — far easier to type than adding and removing boxes. */
export function splitLines(value: unknown): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function ok<T>(c: Context, data: T) {
  return c.json(data);
}
