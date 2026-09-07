import { resolve } from "node:path";
import { loadEnv } from "@audio/config";

/**
 * The local driver's storage directory — the SAME root the worker writes to.
 *
 * Server-side ONLY. In its own file rather than alongside `playableUrl`: this file imports
 * `node:path`, while `playableUrl` is called by a client component — merged, Next would
 * pull `node:path` into the browser bundle and the build would fail.
 */
export function storageRoot(): string {
  return resolve(process.cwd(), "..", "worker", loadEnv().STORAGE_LOCAL_DIR);
}
