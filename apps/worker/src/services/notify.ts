import { loadEnv } from "@audio/config";
import { logger } from "../lib/logger";

/**
 * The events that can be sent. This list is the contract — nothing else defines it, and
 * `NOTIFY_EVENTS` is checked against it at startup.
 */
export const NOTIFY_KINDS = [
  "run_waiting_review",
  "run_done",
  "run_failed",
  "run_stopped",
] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export interface Notification {
  kind: NotifyKind;
  level: "info" | "warn" | "error";
  title: string;
  body: string;
}

/**
 * Shout past the terminal when a run needs a person or has stopped.
 *
 * PURELY an observer. It never retries a job, never changes a status, never stops
 * anything — it repeats what has already happened to a place someone will see. Nothing
 * downstream may depend on whether it worked.
 *
 * Therefore: never awaited by the caller, never throws, and a webhook that is down or
 * slow costs the run a timeout at most. The alternative — a queue wedged because a
 * notification endpoint stopped answering — trades a story for a message about a story.
 */
export function notify(n: Notification): void {
  const env = loadEnv();
  if (!env.NOTIFY_WEBHOOK_URL) return;
  if (!allows(env.NOTIFY_EVENTS, n.kind)) return;

  void send(env.NOTIFY_WEBHOOK_URL, n);
}

/**
 * Which kinds a comma-separated filter lets through. Blank lets everything through.
 *
 * Exported for `assertNotifyEvents`, which checks the setting at startup: a filter full
 * of names that match nothing looks exactly like a webhook that stopped working.
 */
export function allows(filter: string, kind: string): boolean {
  const wanted = parseKinds(filter);
  return wanted.length === 0 || wanted.includes(kind);
}

function parseKinds(filter: string): string[] {
  return filter
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k !== "");
}

/**
 * Reject an unknown event name before any work starts.
 *
 * Called from the worker's startup. A typo in `NOTIFY_EVENTS` silently filters out
 * everything, and the symptom — no notifications — is the same symptom as a dead
 * endpoint, a wrong URL, or a run that never reached a notifiable state.
 */
export function assertNotifyEvents(filter: string): void {
  const unknown = parseKinds(filter).filter((k) => !NOTIFY_KINDS.includes(k as NotifyKind));
  if (unknown.length > 0) {
    throw new Error(
      `NOTIFY_EVENTS lists ${unknown.map((k) => `"${k}"`).join(", ")}, which ${
        unknown.length === 1 ? "is not an event" : "are not events"
      }. Known events: ${NOTIFY_KINDS.join(", ")}. Leave it blank for all of them.`,
    );
  }
}

/** How long to wait on the endpoint before giving up on it. */
const TIMEOUT_MS = 5000;

async function send(url: string, n: Notification): Promise<void> {
  const line = `${n.title} — ${n.body}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The same line under three names. `content` is what a Discord webhook reads and
      // `text` is what Slack reads, so the two webhooks a person is most likely to have
      // work with no shim in between; anything else reads the named fields.
      body: JSON.stringify({ ...n, content: line, text: line }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn(`[notify] ${n.kind}: the webhook answered ${res.status}`);
    }
  } catch (err) {
    // Including the timeout. Nothing here is worth a line above warn: the thing being
    // reported already happened and is already in the log above this one.
    logger.warn(`[notify] ${n.kind}: could not reach the webhook — ${(err as Error).message}`);
  }
}
