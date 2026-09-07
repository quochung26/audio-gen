import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadEnv } from "@audio/config";

/**
 * The local driver's storage directory — the SAME root the worker writes to.
 *
 * The worker runs in `apps/worker`, so `STORAGE_LOCAL_DIR` (default
 * `./data/storage`) resolves against that. The API runs in `apps/api` and has to
 * point back, or files uploaded through the API are missing when the worker
 * mixes.
 */
export function storageRoot(): string {
  return resolve(process.cwd(), "..", "worker", loadEnv().STORAGE_LOCAL_DIR);
}

/**
 * Write a file into local storage and return its KEY (not an absolute path).
 *
 * The key is what goes into the DB: rename the project directory or move to
 * another machine and the key still holds, whereas `file:///Users/...` breaks
 * entirely.
 *
 * Only works with `STORAGE_DRIVER=local`. With R2, Studio has no credentials
 * (and should not) — there the user pastes a public URL instead of uploading.
 */
export async function putLocal(key: string, data: Buffer): Promise<string> {
  if (loadEnv().STORAGE_DRIVER !== "local") {
    throw new Error("Uploads only work with STORAGE_DRIVER=local. With R2, paste a public URL.");
  }

  const root = storageRoot();
  const path = join(root, key);
  // Guard: `key` is indirectly chosen by the user (the filename), so make sure
  // it cannot escape the storage directory.
  if (path !== root && !path.startsWith(root + "/")) {
    throw new Error("Invalid storage key");
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return key;
}

/** Strip accents and odd characters from a filename — less quoting for ffmpeg and paths. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);

  return `${base || "track"}${ext ? `.${ext}` : ""}`;
}

/**
 * Delete a file from storage by KEY. A missing file counts as done.
 *
 * Skips anything that is not a local key: `http(s)://` is cover art the user
 * pasted, and with `STORAGE_DRIVER=r2` the file is not on this disk. Without
 * that guard, cleanup throws midway and leaves half of it deleted.
 *
 * Returns true when something was actually removed — so the caller can count and
 * report it.
 */
export async function removeLocal(key: string): Promise<boolean> {
  if (!key || /^[a-z]+:\/\//i.test(key)) return false;
  if (loadEnv().STORAGE_DRIVER !== "local") return false;

  const root = storageRoot();
  const path = join(root, key);
  // Same guard as `putLocal`: keys come from the DB, and a broken one must not
  // delete anything outside the store.
  if (path !== root && !path.startsWith(root + "/")) return false;

  await rm(path, { force: true });
  return true;
}
